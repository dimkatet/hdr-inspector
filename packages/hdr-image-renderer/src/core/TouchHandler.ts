/**
 * TouchHandler - Touch event handling for canvas interactions
 *
 * Handles touch gestures: single-finger pan, two-finger pinch zoom, double-tap reset.
 * Converts raw touch events to normalized callbacks for viewport control.
 */

export interface TouchCallbacks {
  /** Called on single-finger pan. deltaX/Y: normalized movement */
  onPan: (deltaX: number, deltaY: number) => void;
  /** Called on pinch zoom. scaleDelta: multiplier, centerX/Y: normalized [0,1] */
  onPinchZoom: (scaleDelta: number, centerX: number, centerY: number) => void;
  /** Called on double-tap (reset) */
  onReset: () => void;
}

export interface TouchHandlerConfig {
  /** Enable touch gestures (default: true) */
  enabled?: boolean;
}

export class TouchHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: TouchCallbacks;
  private config: Required<TouchHandlerConfig>;
  private attached = false;

  // Touch state
  private lastTouchPos: { x: number; y: number } | null = null;
  private lastPinchDistance: number | null = null;
  private lastTapTime = 0;
  private lastTapPos: { x: number; y: number } | null = null;

  // Double-tap detection constants
  private static readonly DOUBLE_TAP_DELAY = 300; // ms
  private static readonly DOUBLE_TAP_DISTANCE = 30; // px

  // Bound handlers (for removeEventListener)
  private boundHandleTouchStart: (e: TouchEvent) => void;
  private boundHandleTouchMove: (e: TouchEvent) => void;
  private boundHandleTouchEnd: (e: TouchEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: TouchCallbacks,
    config: TouchHandlerConfig = {}
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.config = {
      enabled: config.enabled ?? true,
    };

    // Bind handlers once
    this.boundHandleTouchStart = this.handleTouchStart.bind(this);
    this.boundHandleTouchMove = this.handleTouchMove.bind(this);
    this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
  }

  /**
   * Attach event listeners to canvas
   * @returns Cleanup function
   */
  attach(): () => void {
    if (this.attached) {
      return () => this.detach();
    }

    if (this.config.enabled) {
      this.canvas.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
      this.canvas.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
      this.canvas.addEventListener('touchend', this.boundHandleTouchEnd);
      this.canvas.addEventListener('touchcancel', this.boundHandleTouchEnd);
    }

    this.attached = true;

    return () => this.detach();
  }

  /**
   * Detach all event listeners
   */
  detach(): void {
    if (!this.attached) return;

    this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart);
    this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove);
    this.canvas.removeEventListener('touchend', this.boundHandleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.boundHandleTouchEnd);

    this.resetTouchState();
    this.attached = false;
  }

  /**
   * Check if handlers are attached
   */
  isAttached(): boolean {
    return this.attached;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.detach();
  }

  // ============================================================
  // Touch Event Handlers
  // ============================================================

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();

    if (e.touches.length === 1) {
      // Single finger - prepare for pan or double-tap
      const touch = e.touches[0];
      this.lastTouchPos = { x: touch.clientX, y: touch.clientY };

      // Check for double-tap
      const now = Date.now();
      if (
        this.lastTapPos &&
        now - this.lastTapTime < TouchHandler.DOUBLE_TAP_DELAY &&
        this.getDistance(this.lastTapPos, { x: touch.clientX, y: touch.clientY }) <
          TouchHandler.DOUBLE_TAP_DISTANCE
      ) {
        // Double-tap detected
        this.callbacks.onReset();
        this.lastTapTime = 0;
        this.lastTapPos = null;
      } else {
        this.lastTapTime = now;
        this.lastTapPos = { x: touch.clientX, y: touch.clientY };
      }

      // Reset pinch state
      this.lastPinchDistance = null;
    } else if (e.touches.length === 2) {
      // Two fingers - prepare for pinch
      this.lastTouchPos = null; // Stop panning
      this.lastPinchDistance = this.getPinchDistance(e.touches);
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();

    if (e.touches.length === 1 && this.lastTouchPos) {
      // Single finger pan
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const deltaX = (touch.clientX - this.lastTouchPos.x) / rect.width;
      const deltaY = (touch.clientY - this.lastTouchPos.y) / rect.height;
      this.lastTouchPos = { x: touch.clientX, y: touch.clientY };
      this.callbacks.onPan(deltaX, deltaY);
    } else if (e.touches.length === 2) {
      // Two finger pinch zoom
      const currentDistance = this.getPinchDistance(e.touches);

      if (this.lastPinchDistance !== null) {
        const scaleDelta = currentDistance / this.lastPinchDistance;
        const rect = this.canvas.getBoundingClientRect();
        const center = this.getPinchCenter(e.touches);
        const centerX = (center.x - rect.left) / rect.width;
        const centerY = (center.y - rect.top) / rect.height;

        this.callbacks.onPinchZoom(scaleDelta, centerX, centerY);
      }

      this.lastPinchDistance = currentDistance;
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.touches.length === 0) {
      // All fingers lifted
      this.resetTouchState();
    } else if (e.touches.length === 1) {
      // One finger remaining - switch to pan mode
      const touch = e.touches[0];
      this.lastTouchPos = { x: touch.clientX, y: touch.clientY };
      this.lastPinchDistance = null;
    }
  }

  // ============================================================
  // Touch Helpers
  // ============================================================

  private resetTouchState(): void {
    this.lastTouchPos = null;
    this.lastPinchDistance = null;
  }

  private getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  private getPinchDistance(touches: TouchList): number {
    const t1 = touches[0];
    const t2 = touches[1];
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  private getPinchCenter(touches: TouchList): { x: number; y: number } {
    const t1 = touches[0];
    const t2 = touches[1];
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }
}
