/**
 * ViewportController - Platform-agnostic zoom/pan logic
 *
 * Handles viewport state management, animation, and input processing.
 * Can be used standalone or integrated into HDRCanvas.
 */

import type {
  EasingFunction,
  MutationListener,
  TransitionEndListener,
  UpdateListener,
  ViewportConfig,
  ViewportMutation,
  ViewportState,
} from '../types';

const DEFAULT_CONFIG: Required<ViewportConfig> = {
  minZoom: 0.1,
  maxZoom: 10,
  animationDuration: 200,
  easing: 'ease-out',
};

/**
 * Easing functions for smooth animations
 */
const EASINGS: Record<EasingFunction, (t: number) => number> = {
  linear: (t) => t,
  'ease-out': (t) => 1 - (1 - t) ** 2, // quadratic ease-out
};

/**
 * Clamp pan values to keep image within viewport bounds.
 * At zoom 1, no pan is allowed (image fills viewport).
 * At zoom > 1, pan is limited so image edges don't go past viewport center.
 */
function clampPan(pan: number, zoom: number): number {
  const maxPan = Math.max(0, (1 - 1 / zoom) / 2);
  return Math.max(-maxPan, Math.min(maxPan, pan));
}

export class ViewportController {
  private state: ViewportState = { zoom: 1, panX: 0, panY: 0 };
  private target: ViewportState = { zoom: 1, panX: 0, panY: 0 };
  private animationId: number | null = null;
  private config: Required<ViewportConfig>;
  private mutationListeners = new Set<MutationListener>();
  private updateListeners = new Set<UpdateListener>();
  private transitionEndListeners = new Set<TransitionEndListener>();

  // Animation state for time-based transitions
  private animationStartState: ViewportState | null = null;
  private animationStartTime: number | null = null;
  private animationDuration = 0;

  constructor(config: Partial<ViewportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current viewport state
   */
  getState(): ViewportState {
    return { ...this.state };
  }

  /**
   * Get target viewport state (where animation is heading)
   */
  getTarget(): ViewportState {
    return { ...this.target };
  }

  /**
   * Notify all mutation listeners about a viewport change intention.
   * Called before animation starts, with the target state.
   */
  private emitMutation(
    mutation: ViewportMutation,
    prev: ViewportState,
    nextTarget: ViewportState
  ): void {
    for (const listener of this.mutationListeners) {
      listener(mutation, prev, nextTarget);
    }
  }

  /**
   * Notify all update listeners about current viewport state.
   * Called on every animation frame and when state changes instantly.
   */
  private emitUpdate(state: ViewportState): void {
    for (const listener of this.updateListeners) {
      listener(state);
    }
  }

  /**
   * Notify all transition end listeners when an animation completes.
   * Not called for instant transitions (duration: 0).
   */
  private emitTransitionEnd(state: ViewportState): void {
    for (const listener of this.transitionEndListeners) {
      listener(state);
    }
  }

  /**
   * Apply a viewport mutation (zoom, pan, reset).
   * This is the main entry point for all viewport changes.
   *
   * Flow:
   * 1. Compute new target state from mutation
   * 2. Emit mutation event (for immediate UI updates)
   * 3. Start transition animation (or apply instantly if transitionSpeed=0)
   */
  applyMutation(mutation: ViewportMutation): void {
    const prevTarget = this.getTarget();
    this.target = this.processMutation(mutation);

    this.emitMutation(mutation, prevTarget, this.getTarget());

    this.startTransition(mutation);
  }

  /**
   * Route mutation to appropriate compute method.
   * Each compute method is a pure function that returns the new target state.
   */
  private processMutation(mutation: ViewportMutation): ViewportState {
    switch (mutation.type) {
      case 'zoom.in':
        return this.computeZoomIn(mutation.factor);
      case 'zoom.out':
        return this.computeZoomOut(mutation.factor);
      case 'zoom.to':
        return this.computeZoomTo(mutation.factor);
      case 'zoom.wheel':
        return this.computeWheelZoom(mutation.zoomDelta, mutation.cursorX, mutation.cursorY);
      case 'zoom.pinch':
        return this.computePinchZoom(mutation.scale, mutation.cx, mutation.cy);
      case 'pan.drag':
        return this.computeDragPan(mutation.deltaX, mutation.deltaY);
      case 'reset':
        return this.computeReset();
      default:
        return { ...this.getTarget() };
    }
  }

  /**
   * Subscribe to mutation events.
   * Mutations fire once when a viewport change is requested, before animation.
   * Useful for UI updates that should reflect the target state immediately.
   * @returns Unsubscribe function
   */
  onMutation(listener: MutationListener): () => void {
    this.mutationListeners.add(listener);

    return () => {
      this.mutationListeners.delete(listener);
    };
  }

  /**
   * Subscribe to state update events.
   * Updates fire on every animation frame during transitions.
   * Useful for rendering that needs smooth interpolated values.
   * @returns Unsubscribe function
   */
  onUpdate(listener: UpdateListener): () => void {
    this.updateListeners.add(listener);

    return () => {
      this.updateListeners.delete(listener);
    };
  }

  /**
   * Subscribe to transition end events.
   * Fires when an animated transition completes (not called for instant transitions).
   * Useful for UI updates that should happen after animation finishes.
   * @returns Unsubscribe function
   */
  onTransitionEnd(listener: TransitionEndListener): () => void {
    this.transitionEndListeners.add(listener);

    return () => {
      this.transitionEndListeners.delete(listener);
    };
  }

  /**
   * Compute reset state (zoom 1, no pan)
   */
  private computeReset(): ViewportState {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  /**
   * Compute zoom in by a factor (centered)
   */
  private computeZoomIn(factor = 2): ViewportState {
    const prevTarget = this.getTarget();
    const newZoom = Math.min(this.config.maxZoom, prevTarget.zoom * factor);
    return { ...prevTarget, zoom: newZoom };
  }

  /**
   * Compute zoom out by a factor (centered)
   */
  private computeZoomOut(factor = 2): ViewportState {
    const prevTarget = this.getTarget();
    const newZoom = Math.max(this.config.minZoom, prevTarget.zoom / factor);
    return {
      ...prevTarget,
      zoom: newZoom,
      panX: clampPan(prevTarget.panX, newZoom),
      panY: clampPan(prevTarget.panY, newZoom),
    };
  }

  /**
   * Compute zoom to specific level (centered)
   */
  private computeZoomTo(zoom: number): ViewportState {
    const prevTarget = this.getTarget();
    const newZoom = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, zoom));
    return {
      ...prevTarget,
      zoom: newZoom,
      panX: clampPan(prevTarget.panX, newZoom),
      panY: clampPan(prevTarget.panY, newZoom),
    };
  }

  /**
   * Compute wheel zoom centered on cursor position
   */
  private computeWheelZoom(zoomDelta: number, cursorX: number, cursorY: number): ViewportState {
    const prevTarget = this.getTarget();
    const newZoom = Math.max(
      this.config.minZoom,
      Math.min(this.config.maxZoom, prevTarget.zoom * (1 + zoomDelta))
    );

    const zoomRatio = newZoom / prevTarget.zoom;
    const mouseOffsetX = cursorX - 0.5;
    const mouseOffsetY = cursorY - 0.5;

    const newPanX = prevTarget.panX + (mouseOffsetX * (1 - 1 / zoomRatio)) / newZoom;
    const newPanY = prevTarget.panY + (mouseOffsetY * (1 - 1 / zoomRatio)) / newZoom;

    return {
      ...prevTarget,
      zoom: newZoom,
      panX: clampPan(newPanX, newZoom),
      panY: clampPan(newPanY, newZoom),
    };
  }

  /**
   * Compute drag pan
   */
  private computeDragPan(deltaX: number, deltaY: number): ViewportState {
    const newPanX = this.state.panX - deltaX / this.state.zoom;
    const newPanY = this.state.panY - deltaY / this.state.zoom;

    return {
      ...this.getTarget(),
      panX: clampPan(newPanX, this.state.zoom),
      panY: clampPan(newPanY, this.state.zoom),
    };
  }

  /**
   * Compute pinch zoom centered on a point
   */
  private computePinchZoom(scale: number, cx: number, cy: number): ViewportState {
    const t = { ...this.getTarget() };
    const newZoom = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, t.zoom * scale));
    const offsetX = cx - 0.5;
    const offsetY = cy - 0.5;

    return {
      ...t,
      zoom: newZoom,
      panX: clampPan(t.panX + (offsetX * (1 - 1 / scale)) / newZoom, newZoom),
      panY: clampPan(t.panY + (offsetY * (1 - 1 / scale)) / newZoom, newZoom),
    };
  }

  /**
   * Get animation duration for a mutation in milliseconds.
   * Returns 0 for instant transitions (drag, pinch), or config duration for animated ones.
   * Can be overridden per-mutation via duration property.
   */
  private getDuration(mutation: ViewportMutation): number {
    if (mutation.duration !== undefined) return mutation.duration;

    switch (mutation.type) {
      case 'pan.drag':
      case 'zoom.pinch':
        return 0;
      default:
        return this.config.animationDuration;
    }
  }

  /**
   * Start time-based transition animation.
   * Uses performance.now() for frame-rate independent animation.
   * If duration is 0, applies state instantly without animation.
   */
  private startTransition(mutation: ViewportMutation): void {
    const duration = this.getDuration(mutation);

    // Instant transition
    if (duration === 0) {
      this.state = { ...this.target };
      this.animationId = null;
      this.animationStartState = null;
      this.animationStartTime = null;
      this.emitUpdate(this.state);
      return;
    }

    // Start new animation from current state
    // (if already animating, this restarts from current interpolated position)
    this.animationStartState = { ...this.state };
    this.animationStartTime = performance.now();
    this.animationDuration = duration;

    // Don't start new rAF loop if one is already running
    if (this.animationId !== null) return;

    const easing = EASINGS[this.config.easing];

    const animate = (currentTime: number) => {
      if (this.animationStartTime === null || this.animationStartState === null) {
        this.animationId = null;
        return;
      }

      const elapsed = currentTime - this.animationStartTime;
      const progress = Math.min(elapsed / this.animationDuration, 1);
      const easedProgress = easing(progress);

      const startState = this.animationStartState;
      const newZoom =
        startState.zoom + (this.target.zoom - startState.zoom) * easedProgress;
      const newPanX =
        startState.panX + (this.target.panX - startState.panX) * easedProgress;
      const newPanY =
        startState.panY + (this.target.panY - startState.panY) * easedProgress;

      this.state = {
        zoom: newZoom,
        panX: clampPan(newPanX, newZoom),
        panY: clampPan(newPanY, newZoom),
      };

      this.emitUpdate(this.state);

      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        // Animation complete - snap to exact target
        this.state = { ...this.target };
        this.animationId = null;
        this.animationStartState = null;
        this.animationStartTime = null;
        this.emitUpdate(this.state);
        this.emitTransitionEnd(this.state);
      }
    };

    this.animationId = requestAnimationFrame(animate);
  }

  /**
   * Stop animation
   */
  stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Check if animation is running
   */
  isAnimating(): boolean {
    return this.animationId !== null;
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<ViewportConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAnimation();
    this.mutationListeners.clear();
    this.updateListeners.clear();
    this.transitionEndListeners.clear();
  }
}
