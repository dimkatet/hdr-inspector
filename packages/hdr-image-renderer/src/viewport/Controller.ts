/**
 * ViewportController - Platform-agnostic zoom/pan logic
 *
 * Handles viewport state management, animation, and input processing.
 * Can be used standalone or integrated into HDRCanvas.
 *
 * Implements ViewportFacade to receive user interactions from handlers.
 */

import type { DomainEventMap } from '../core/EventTypes';
import type { RuntimeContext, RuntimeService } from '../core/RuntimeService';
import type { TypedEventBus } from '../core/TypedEventBus';
import type { ViewportFacade } from '../interaction/ViewportFacade';
import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import type { EasingFunction, ViewportConfig, ViewportMutation, ViewportState } from '../types';

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

export class ViewportController implements ViewportFacade, RuntimeService {
  private state: ViewportState = { zoom: 1, panX: 0, panY: 0 };
  private target: ViewportState = { zoom: 1, panX: 0, panY: 0 };
  private animationId: number | null = null;
  private config: Required<ViewportConfig>;

  // Animation state for time-based transitions
  private animationStartState: ViewportState | null = null;
  private animationStartTime: number | null = null;
  private animationDuration = 0;

  private logger: Logger;

  constructor(
    config: Partial<ViewportConfig> = {},
    private eventBus?: TypedEventBus<DomainEventMap>,
    logger?: Logger
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? silentLogger;
  }

  /**
   * Get current viewport state
   */
  getState(): ViewportState {
    return { ...this.state };
  }

  /**
   * Check whether the image can pan in the given direction.
   * Mirrors the clampPan logic: returns false when zoom ≤ 1 (no pan space)
   * or when the current pan is already at the edge in the requested direction.
   */
  canPan(deltaX = 0, deltaY = 0): boolean {
    const { zoom, panX, panY } = this.state;
    if (zoom <= 1) return false;

    const maxPan = (1 - 1 / zoom) / 2;

    // No direction given — image is zoomed in so some pan is always possible
    if (deltaX === 0 && deltaY === 0) return true;

    // deltaX > 0: panX will decrease → approaching -maxPan edge
    // deltaX < 0: panX will increase → approaching +maxPan edge
    const EDGE = 1e-4;
    const canX =
      deltaX > 0 ? panX > -(maxPan - EDGE) : deltaX < 0 ? panX < maxPan - EDGE : false;
    const canY =
      deltaY > 0 ? panY > -(maxPan - EDGE) : deltaY < 0 ? panY < maxPan - EDGE : false;

    return canX || canY;
  }

  /**
   * Get target viewport state (where animation is heading)
   */
  getTarget(): ViewportState {
    return { ...this.target };
  }

  /**
   * Emit mutation event via EventBus
   * Called before animation starts, with the target state.
   */
  private emitMutation(
    mutation: ViewportMutation,
    prev: ViewportState,
    nextTarget: ViewportState
  ): void {
    this.eventBus?.emit('viewport:mutation', { mutation, prev, target: nextTarget });
  }

  /**
   * Emit update event via EventBus
   * Called on every animation frame and when state changes instantly.
   */
  private emitUpdate(state: ViewportState): void {
    this.eventBus?.emit('viewport:update', { state });
  }

  /**
   * Emit transition end event via EventBus
   * Called when an animation completes (not for instant transitions).
   */
  private emitTransitionEnd(state: ViewportState): void {
    this.eventBus?.emit('viewport:transitionEnd', { state });
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

    this.logger.log('[ViewportController] applyMutation:', {
      type: mutation.type,
      source: mutation.source,
      prevZoom: prevTarget.zoom.toFixed(3),
      targetZoom: this.target.zoom.toFixed(3),
    });

    this.emitMutation(mutation, prevTarget, this.getTarget());

    this.startTransition(mutation);
  }

  /**
   * Route mutation to appropriate compute method.
   * Each compute method is a pure function that returns the new target state.
   */
  private processMutation(mutation: ViewportMutation): ViewportState {
    switch (mutation.type) {
      case 'zoom':
        return this.computeZoom(mutation.zoom, mutation.centerX, mutation.centerY);
      case 'pan':
        return this.computePan(mutation.deltaX, mutation.deltaY);
      case 'reset':
        return this.computeReset();
      default:
        return { ...this.getTarget() };
    }
  }

  /**
   * Compute reset state (zoom 1, no pan)
   */
  private computeReset(): ViewportState {
    return { zoom: 1, panX: 0, panY: 0 };
  }

  /**
   * Compute zoom to specific level, optionally centered on a point
   * @param zoom Target zoom level
   * @param centerX Center X in normalized coordinates [0,1] (optional, defaults to 0.5)
   * @param centerY Center Y in normalized coordinates [0,1] (optional, defaults to 0.5)
   */
  private computeZoom(zoom: number, centerX?: number, centerY?: number): ViewportState {
    const prevTarget = this.getTarget();
    const newZoom = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, zoom));

    // If no center provided, zoom from center (simple case)
    if (centerX === undefined || centerY === undefined) {
      return {
        ...prevTarget,
        zoom: newZoom,
        panX: clampPan(prevTarget.panX, newZoom),
        panY: clampPan(prevTarget.panY, newZoom),
      };
    }

    // Zoom centered on specific point (e.g., cursor position)
    const zoomRatio = newZoom / prevTarget.zoom;
    const offsetX = centerX - 0.5;
    const offsetY = centerY - 0.5;

    const newPanX = prevTarget.panX + (offsetX * (1 - 1 / zoomRatio)) / newZoom;
    const newPanY = prevTarget.panY + (offsetY * (1 - 1 / zoomRatio)) / newZoom;

    return {
      ...prevTarget,
      zoom: newZoom,
      panX: clampPan(newPanX, newZoom),
      panY: clampPan(newPanY, newZoom),
    };
  }

  /**
   * Compute pan by delta
   * @param deltaX Pan delta X in normalized coordinates
   * @param deltaY Pan delta Y in normalized coordinates
   */
  private computePan(deltaX: number, deltaY: number): ViewportState {
    const newPanX = this.state.panX - deltaX / this.state.zoom;
    const newPanY = this.state.panY - deltaY / this.state.zoom;

    return {
      ...this.getTarget(),
      panX: clampPan(newPanX, this.state.zoom),
      panY: clampPan(newPanY, this.state.zoom),
    };
  }

  /**
   * Get animation duration for a mutation in milliseconds.
   * Returns 0 for instant transitions (drag/wheel/pinch), or config duration for animated ones (button/programmatic).
   * Can be overridden per-mutation via duration property.
   */
  private getDuration(mutation: ViewportMutation): number {
    if (mutation.duration !== undefined) return mutation.duration;

    // Instant transitions for user drag/wheel/pinch gestures
    if (mutation.source === 'drag' || mutation.source === 'wheel' || mutation.source === 'pinch') {
      return 0;
    }

    // Animated transitions for buttons, keyboard shortcuts, programmatic calls
    return this.config.animationDuration;
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
    if (this.animationId !== null) {
      return;
    }

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
      const newZoom = startState.zoom + (this.target.zoom - startState.zoom) * easedProgress;
      const newPanX = startState.panX + (this.target.panX - startState.panX) * easedProgress;
      const newPanY = startState.panY + (this.target.panY - startState.panY) * easedProgress;

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
    this.config = {
      animationDuration: config.animationDuration ?? this.config.animationDuration,
      easing: config.easing ?? this.config.easing,
      minZoom: config.minZoom ?? this.config.minZoom,
      maxZoom: config.maxZoom ?? this.config.maxZoom,
    };
  }

  // ============================================================
  // RuntimeService implementation
  // ============================================================

  async init(_ctx: RuntimeContext): Promise<void> {
    // no-op — ViewportController is configured via constructor
  }

  start(): void {
    // no-op — event subscriptions are wired externally by CanvasRuntime
  }

  stop(): void {
    this.stopAnimation();
  }

  dispose(): void {
    this.stopAnimation();
  }
}
