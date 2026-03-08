/**
 * PointerHandler - Unified pointer event handling for canvas interactions
 *
 * Handles pan, pinch zoom, double-tap/double-click, and wheel zoom via the
 * Pointer Events API, which unifies mouse, touch, and pen input into a single
 * event stream.
 *
 * State transitions (single pointer):
 *   pointerdown           → possible (no event consumption)
 *   pointermove < 5px     → possible (preventDefault on touch if zoom > 1, no stopPropagation)
 *   pointermove ≥ 5px     → active if canPan(direction), else idle (abort)
 *   pointerup/cancel      → idle
 *
 * Two-pointer pinch activates immediately (no threshold) per standard gesture UX.
 *
 * Pointer capture (setPointerCapture) is used for mouse/pen to guarantee receiving
 * pointermove/pointerup even outside the canvas boundary. For touch, the browser
 * applies implicit pointer capture per spec, so explicit capture is skipped.
 *
 * touch-action: none is set on the canvas when touch is enabled to prevent the browser
 * from initiating native scroll, pinch-zoom, or swipe-to-navigate on the canvas.
 *
 * iOS note: preventDefault in pointerdown/pointermove-POSSIBLE (when zoom > 1) is
 * required to prevent Safari from preemptively starting native scroll before the
 * threshold decision. stopPropagation is withheld until ACTIVE so that parent
 * handlers (e.g. carousels) still receive early events and can decide their intent.
 */

export interface PointerCallbacks {
  /** Called on pan (single-pointer drag or one-finger touch). deltaX/Y: normalized movement */
  onPan: (deltaX: number, deltaY: number) => void;
  /** Called on pinch gesture. scaleDelta: distance multiplier, centerX/Y: normalized [0,1] */
  onPinch: (scaleDelta: number, centerX: number, centerY: number) => void;
  /** Called on double-tap or double-click */
  onDoubleTap: () => void;
  /** Called on wheel event. deltaY: raw wheel delta, cursorX/Y: normalized [0,1] */
  onWheel: (deltaY: number, cursorX: number, cursorY: number) => void;
  /**
   * Optional guard for pan gestures.
   * - Called with (0, 0) to check if any pan is possible (proxy for zoom > 1).
   * - Called with (normalizedDx, normalizedDy) at threshold crossing for direction check.
   * Return false to abort / propagate; true to capture the gesture.
   */
  canPan?: (deltaX: number, deltaY: number) => boolean;
}

export interface PointerHandlerConfig {
  /** Enable mouse wheel zoom (default: true) */
  wheel?: boolean;
  /** Enable mouse/pen drag pan and double-click (default: true) */
  drag?: boolean;
  /** Enable touch pan, pinch zoom, and double-tap (default: true) */
  touch?: boolean;
}

type GestureState = 'idle' | 'possible' | 'active';

export class PointerHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: PointerCallbacks;
  private config: Required<PointerHandlerConfig>;
  private attached = false;

  // Active pointers by pointerId
  private pointers = new Map<number, { x: number; y: number }>();

  // Gesture state machine (single-pointer pan)
  private gestureState: GestureState = 'idle';
  private primaryPointerId: number | null = null;
  private startPos: { x: number; y: number } | null = null;
  private lastPos: { x: number; y: number } | null = null;

  // Pinch state
  private lastPinchDistance: number | null = null;

  // Double-tap / double-click detection
  private lastTapTime = 0;
  private lastTapPos: { x: number; y: number } | null = null;

  /** Minimum movement in pixels before single-pointer pan is confirmed. */
  static readonly PAN_THRESHOLD_PX = 5;
  private static readonly DOUBLE_TAP_DELAY = 300; // ms
  private static readonly DOUBLE_TAP_DISTANCE = 30; // px

  // Saved touch-action to restore on detach
  private savedTouchAction = '';

  // Bound handlers (for removeEventListener)
  private boundHandlePointerDown: (e: PointerEvent) => void;
  private boundHandlePointerMove: (e: PointerEvent) => void;
  private boundHandlePointerUp: (e: PointerEvent) => void;
  private boundHandlePointerCancel: (e: PointerEvent) => void;
  private boundHandleWheel: (e: WheelEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: PointerCallbacks,
    config: PointerHandlerConfig = {}
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.config = {
      wheel: config.wheel ?? true,
      drag: config.drag ?? true,
      touch: config.touch ?? true,
    };

    this.boundHandlePointerDown = this.handlePointerDown.bind(this);
    this.boundHandlePointerMove = this.handlePointerMove.bind(this);
    this.boundHandlePointerUp = this.handlePointerUp.bind(this);
    this.boundHandlePointerCancel = this.handlePointerCancel.bind(this);
    this.boundHandleWheel = this.handleWheel.bind(this);
  }

  /**
   * Attach event listeners to canvas.
   * @returns Cleanup function
   */
  attach(): () => void {
    if (this.attached) return () => this.detach();

    // Set touch-action: none so the browser doesn't initiate native scroll, pinch-zoom,
    // or swipe-to-navigate on the canvas. This lets our gesture handlers take full control
    // and is the standard approach used by all gesture libraries (Hammer.js, Mapbox, etc.).
    // Only needed when touch is enabled; mouse/pen are unaffected by touch-action.
    if (this.config.touch) {
      this.savedTouchAction = this.canvas.style.touchAction;
      this.canvas.style.touchAction = 'none';
    }

    // Always attach pointerdown: focus management and double-tap detection apply
    // even when drag/touch pan is disabled.
    this.canvas.addEventListener('pointerdown', this.boundHandlePointerDown, { passive: false });

    if (this.config.drag || this.config.touch) {
      this.canvas.addEventListener('pointermove', this.boundHandlePointerMove, { passive: false });
      this.canvas.addEventListener('pointerup', this.boundHandlePointerUp);
      this.canvas.addEventListener('pointercancel', this.boundHandlePointerCancel);
    }

    if (this.config.wheel) {
      this.canvas.addEventListener('wheel', this.boundHandleWheel, { passive: false });
    }

    this.attached = true;
    return () => this.detach();
  }

  /**
   * Detach all event listeners.
   */
  detach(): void {
    if (!this.attached) return;

    this.canvas.removeEventListener('pointerdown', this.boundHandlePointerDown);
    this.canvas.removeEventListener('pointermove', this.boundHandlePointerMove);
    this.canvas.removeEventListener('pointerup', this.boundHandlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.boundHandlePointerCancel);
    this.canvas.removeEventListener('wheel', this.boundHandleWheel);

    if (this.config.touch) {
      this.canvas.style.touchAction = this.savedTouchAction;
    }

    this.resetState();
    this.pointers.clear();
    this.attached = false;
  }

  isAttached(): boolean {
    return this.attached;
  }

  destroy(): void {
    this.detach();
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  private handlePointerDown(e: PointerEvent): void {
    // Focus canvas so keyboard shortcuts work without requiring a separate click.
    this.canvas.focus();

    const isTouch = e.pointerType === 'touch';
    if (isTouch && !this.config.touch) return;
    if (!isTouch && !this.config.drag) return;

    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 1) {
      // First pointer — enter POSSIBLE, wait for threshold.
      this.primaryPointerId = e.pointerId;
      this.gestureState = 'possible';
      this.startPos = { x: e.clientX, y: e.clientY };
      this.lastPos = { x: e.clientX, y: e.clientY };
      this.lastPinchDistance = null;

      // Double-tap / double-click detection.
      const now = Date.now();
      if (
        this.lastTapPos &&
        now - this.lastTapTime < PointerHandler.DOUBLE_TAP_DELAY &&
        this.getDistance(this.lastTapPos, { x: e.clientX, y: e.clientY }) <
          PointerHandler.DOUBLE_TAP_DISTANCE
      ) {
        this.callbacks.onDoubleTap();
        this.lastTapTime = 0;
        this.lastTapPos = null;
      } else {
        this.lastTapTime = now;
        this.lastTapPos = { x: e.clientX, y: e.clientY };
      }

      // iOS scroll prevention: if image can be panned (zoom > 1), block native scroll
      // while in POSSIBLE state. We do NOT stopPropagation here — parent (e.g. carousel)
      // still receives pointerdown and can begin tracking its own gesture intent.
      if (isTouch && (!this.callbacks.canPan || this.callbacks.canPan(0, 0))) {
        e.preventDefault();
      }
    } else if (this.pointers.size === 2) {
      // Second pointer — immediately ACTIVE for pinch, no threshold needed.
      // Consume fully so no parent can interfere with pinch.
      e.preventDefault();
      e.stopPropagation();
      this.gestureState = 'active';
      this.lastPinchDistance = this.getPinchDistance();

      // Capture both pointers for mouse/pen pinch so events continue outside the canvas.
      // Skip for touch — the browser applies implicit capture per spec.
      if (e.pointerType !== 'touch') {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
        if (this.primaryPointerId !== null) {
          try {
            this.canvas.setPointerCapture(this.primaryPointerId);
          } catch {
            /* pointer already released */
          }
        }
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;

    // Update pointer position in the map.
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2) {
      // ── Pinch ──────────────────────────────────────────────────────────────
      if (this.gestureState !== 'active' || this.lastPinchDistance === null) return;
      e.preventDefault();
      e.stopPropagation();

      const currentDistance = this.getPinchDistance();
      const scaleDelta = currentDistance / this.lastPinchDistance;
      const center = this.getPinchCenter();
      const rect = this.canvas.getBoundingClientRect();
      const centerX = (center.x - rect.left) / rect.width;
      const centerY = (center.y - rect.top) / rect.height;

      this.callbacks.onPinch(scaleDelta, centerX, centerY);
      this.lastPinchDistance = currentDistance;
      return;
    }

    // ── Single-pointer pan ─────────────────────────────────────────────────
    if (e.pointerId !== this.primaryPointerId) return;
    if (this.gestureState === 'idle' || !this.startPos || !this.lastPos) return;

    const isTouch = e.pointerType === 'touch';

    if (this.gestureState === 'possible') {
      const dx = e.clientX - this.startPos.x;
      const dy = e.clientY - this.startPos.y;

      if (Math.hypot(dx, dy) < PointerHandler.PAN_THRESHOLD_PX) {
        // Below threshold — track position incrementally so the first active delta
        // will be smooth (no jump, no wasted threshold distance).
        // Block iOS scroll if zoom > 1, but don't stopPropagation: parent (carousel)
        // can still track this event for its own gesture detection.
        this.lastPos = { x: e.clientX, y: e.clientY };
        if (isTouch && (!this.callbacks.canPan || this.callbacks.canPan(0, 0))) {
          e.preventDefault();
        }
        return;
      }

      // Threshold crossed — check direction.
      const rect = this.canvas.getBoundingClientRect();
      const normalizedDx = dx / rect.width;
      const normalizedDy = dy / rect.height;

      if (this.callbacks.canPan && !this.callbacks.canPan(normalizedDx, normalizedDy)) {
        // Can't pan in this direction — abort, release gesture ownership.
        this.gestureState = 'idle';
        this.startPos = null;
        return;
      }

      // Activate. For mouse/pen: setPointerCapture ensures we receive
      // pointermove/pointerup even when the pointer leaves the canvas.
      // For touch: the browser applies implicit capture per spec, so explicit
      // capture is skipped (explicit capture breaks DevTools touch emulation).
      this.gestureState = 'active';
      if (e.pointerType !== 'touch') {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
      }
      // Don't return — fall through to ACTIVE block to emit the first delta immediately.
      // lastPos was updated on each POSSIBLE pointermove, so the first delta is
      // incremental (no skipped frame, no wasted threshold distance).
    }

    if (this.gestureState === 'active') {
      e.preventDefault();
      e.stopPropagation(); // parent (carousel) stops receiving events from this point
      const rect = this.canvas.getBoundingClientRect();
      const deltaX = (e.clientX - this.lastPos.x) / rect.width;
      const deltaY = (e.clientY - this.lastPos.y) / rect.height;
      this.lastPos = { x: e.clientX, y: e.clientY };
      this.callbacks.onPan(deltaX, deltaY);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (this.pointers.size === 0) {
      // All pointers lifted — reset.
      this.gestureState = 'idle';
      this.primaryPointerId = null;
      this.resetState();
    } else if (this.pointers.size === 1) {
      // One finger remaining after pinch — continue as ACTIVE pan (no threshold).
      // Skip threshold: user is already in an active interaction.
      const [remainingId, pos] = [...this.pointers.entries()][0];
      this.primaryPointerId = remainingId;
      this.gestureState = 'active';
      this.startPos = { x: pos.x, y: pos.y };
      this.lastPos = { x: pos.x, y: pos.y };
      this.lastPinchDistance = null;
    }
  }

  private handlePointerCancel(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (this.pointers.size === 0) {
      this.gestureState = 'idle';
      this.primaryPointerId = null;
      this.resetState();
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const cursorX = (e.clientX - rect.left) / rect.width;
    const cursorY = (e.clientY - rect.top) / rect.height;
    this.callbacks.onWheel(e.deltaY, cursorX, cursorY);
  }

  // ============================================================
  // Helpers
  // ============================================================

  private resetState(): void {
    this.startPos = null;
    this.lastPos = null;
    this.lastPinchDistance = null;
  }

  private getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  private getPinchDistance(): number {
    const [p1, p2] = [...this.pointers.values()];
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  private getPinchCenter(): { x: number; y: number } {
    const [p1, p2] = [...this.pointers.values()];
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
}
