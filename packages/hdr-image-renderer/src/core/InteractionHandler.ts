/**
 * InteractionHandler - DOM event handling for canvas interactions
 *
 * Converts raw DOM events to normalized callbacks.
 * Platform-specific code is isolated here, keeping other classes pure.
 */

export interface InteractionCallbacks {
  /** Called on wheel zoom. deltaY: wheel delta, cursorX/Y: normalized [0,1] */
  onWheelZoom: (deltaY: number, cursorX: number, cursorY: number) => void
  /** Called on drag pan. deltaX/Y: normalized movement */
  onDragPan: (deltaX: number, deltaY: number) => void
  /** Called on double-click or double-tap (reset) */
  onReset: () => void
  /** Called on pinch zoom. scaleDelta: multiplier, centerX/Y: normalized [0,1] */
  onPinchZoom?: (scaleDelta: number, centerX: number, centerY: number) => void
}

export interface InteractionHandlerConfig {
  /** Enable mouse wheel zoom (default: true) */
  wheel?: boolean
  /** Enable mouse drag pan (default: true) */
  drag?: boolean
  /** Enable touch gestures (default: true) */
  touch?: boolean
}

export class InteractionHandler {
  private canvas: HTMLCanvasElement
  private callbacks: InteractionCallbacks
  private config: Required<InteractionHandlerConfig>
  private attached = false

  // Mouse drag state
  private isDragging = false
  private lastPos = { x: 0, y: 0 }

  // Touch state
  private lastTouchPos: { x: number; y: number } | null = null
  private lastPinchDistance: number | null = null
  private lastTapTime = 0
  private lastTapPos: { x: number; y: number } | null = null

  // Double-tap detection constants
  private static readonly DOUBLE_TAP_DELAY = 300 // ms
  private static readonly DOUBLE_TAP_DISTANCE = 30 // px

  // Bound handlers (for removeEventListener)
  private boundHandleWheel: (e: WheelEvent) => void
  private boundHandleMouseDown: (e: MouseEvent) => void
  private boundHandleMouseMove: (e: MouseEvent) => void
  private boundHandleMouseUp: () => void
  private boundHandleDblClick: (e: MouseEvent) => void
  private boundHandleTouchStart: (e: TouchEvent) => void
  private boundHandleTouchMove: (e: TouchEvent) => void
  private boundHandleTouchEnd: (e: TouchEvent) => void

  constructor(canvas: HTMLCanvasElement, callbacks: InteractionCallbacks, config: InteractionHandlerConfig = {}) {
    this.canvas = canvas
    this.callbacks = callbacks
    this.config = {
      wheel: config.wheel ?? true,
      drag: config.drag ?? true,
      touch: config.touch ?? true,
    }

    // Bind handlers once
    this.boundHandleWheel = this.handleWheel.bind(this)
    this.boundHandleMouseDown = this.handleMouseDown.bind(this)
    this.boundHandleMouseMove = this.handleMouseMove.bind(this)
    this.boundHandleMouseUp = this.handleMouseUp.bind(this)
    this.boundHandleDblClick = this.handleDblClick.bind(this)
    this.boundHandleTouchStart = this.handleTouchStart.bind(this)
    this.boundHandleTouchMove = this.handleTouchMove.bind(this)
    this.boundHandleTouchEnd = this.handleTouchEnd.bind(this)
  }

  /**
   * Attach event listeners to canvas
   * @returns Cleanup function
   */
  attach(): () => void {
    if (this.attached) {
      return () => this.detach()
    }

    // Mouse events (wheel and drag)
    if (this.config.wheel) {
      this.canvas.addEventListener('wheel', this.boundHandleWheel, { passive: false })
    }
    if (this.config.drag) {
      this.canvas.addEventListener('mousedown', this.boundHandleMouseDown)
      this.canvas.addEventListener('dblclick', this.boundHandleDblClick)
    }

    // Touch events
    if (this.config.touch) {
      this.canvas.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false })
      this.canvas.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false })
      this.canvas.addEventListener('touchend', this.boundHandleTouchEnd)
      this.canvas.addEventListener('touchcancel', this.boundHandleTouchEnd)
    }

    this.attached = true

    return () => this.detach()
  }

  /**
   * Detach all event listeners
   */
  detach(): void {
    if (!this.attached) return

    // Mouse events
    this.canvas.removeEventListener('wheel', this.boundHandleWheel)
    this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown)
    this.canvas.removeEventListener('dblclick', this.boundHandleDblClick)
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)

    // Touch events
    this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart)
    this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove)
    this.canvas.removeEventListener('touchend', this.boundHandleTouchEnd)
    this.canvas.removeEventListener('touchcancel', this.boundHandleTouchEnd)

    this.isDragging = false
    this.resetTouchState()
    this.attached = false
  }

  /**
   * Check if handlers are attached
   */
  isAttached(): boolean {
    return this.attached
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.detach()
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  private handleWheel(e: WheelEvent): void {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const cursorX = (e.clientX - rect.left) / rect.width
    const cursorY = (e.clientY - rect.top) / rect.height
    this.callbacks.onWheelZoom(e.deltaY, cursorX, cursorY)
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return // Left click only
    e.preventDefault()
    this.isDragging = true
    this.lastPos = { x: e.clientX, y: e.clientY }
    document.addEventListener('mousemove', this.boundHandleMouseMove)
    document.addEventListener('mouseup', this.boundHandleMouseUp)
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return
    const rect = this.canvas.getBoundingClientRect()
    const deltaX = (e.clientX - this.lastPos.x) / rect.width
    const deltaY = (e.clientY - this.lastPos.y) / rect.height
    this.lastPos = { x: e.clientX, y: e.clientY }
    this.callbacks.onDragPan(deltaX, deltaY)
  }

  private handleMouseUp(): void {
    this.isDragging = false
    document.removeEventListener('mousemove', this.boundHandleMouseMove)
    document.removeEventListener('mouseup', this.boundHandleMouseUp)
  }

  private handleDblClick(e: MouseEvent): void {
    e.preventDefault()
    this.callbacks.onReset()
  }

  // ============================================================
  // Touch Event Handlers
  // ============================================================

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()

    if (e.touches.length === 1) {
      // Single finger - prepare for pan or double-tap
      const touch = e.touches[0]
      this.lastTouchPos = { x: touch.clientX, y: touch.clientY }

      // Check for double-tap
      const now = Date.now()
      if (
        this.lastTapPos &&
        now - this.lastTapTime < InteractionHandler.DOUBLE_TAP_DELAY &&
        this.getDistance(this.lastTapPos, { x: touch.clientX, y: touch.clientY }) <
          InteractionHandler.DOUBLE_TAP_DISTANCE
      ) {
        // Double-tap detected
        this.callbacks.onReset()
        this.lastTapTime = 0
        this.lastTapPos = null
      } else {
        this.lastTapTime = now
        this.lastTapPos = { x: touch.clientX, y: touch.clientY }
      }

      // Reset pinch state
      this.lastPinchDistance = null
    } else if (e.touches.length === 2) {
      // Two fingers - prepare for pinch
      this.lastTouchPos = null // Stop panning
      this.lastPinchDistance = this.getPinchDistance(e.touches)
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault()

    if (e.touches.length === 1 && this.lastTouchPos) {
      // Single finger pan
      const touch = e.touches[0]
      const rect = this.canvas.getBoundingClientRect()
      const deltaX = (touch.clientX - this.lastTouchPos.x) / rect.width
      const deltaY = (touch.clientY - this.lastTouchPos.y) / rect.height
      this.lastTouchPos = { x: touch.clientX, y: touch.clientY }
      this.callbacks.onDragPan(deltaX, deltaY)
    } else if (e.touches.length === 2 && this.callbacks.onPinchZoom) {
      // Two finger pinch zoom
      const currentDistance = this.getPinchDistance(e.touches)

      if (this.lastPinchDistance !== null) {
        const scaleDelta = currentDistance / this.lastPinchDistance
        const rect = this.canvas.getBoundingClientRect()
        const center = this.getPinchCenter(e.touches)
        const centerX = (center.x - rect.left) / rect.width
        const centerY = (center.y - rect.top) / rect.height

        this.callbacks.onPinchZoom(scaleDelta, centerX, centerY)
      }

      this.lastPinchDistance = currentDistance
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.touches.length === 0) {
      // All fingers lifted
      this.resetTouchState()
    } else if (e.touches.length === 1) {
      // One finger remaining - switch to pan mode
      const touch = e.touches[0]
      this.lastTouchPos = { x: touch.clientX, y: touch.clientY }
      this.lastPinchDistance = null
    }
  }

  // ============================================================
  // Touch Helpers
  // ============================================================

  private resetTouchState(): void {
    this.lastTouchPos = null
    this.lastPinchDistance = null
  }

  private getDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y)
  }

  private getPinchDistance(touches: TouchList): number {
    const t1 = touches[0]
    const t2 = touches[1]
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
  }

  private getPinchCenter(touches: TouchList): { x: number; y: number } {
    const t1 = touches[0]
    const t2 = touches[1]
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    }
  }
}
