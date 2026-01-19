/**
 * MouseHandler - Mouse event handling for canvas interactions
 *
 * Handles mouse wheel zoom and drag pan events.
 * Converts raw DOM events to normalized callbacks for viewport control.
 */

export interface MouseCallbacks {
  /** Called on wheel zoom. zoomDelta: calculated zoom change, cursorX/Y: normalized [0,1] */
  onWheelZoom: (zoomDelta: number, cursorX: number, cursorY: number) => void;
  /** Called on drag pan. deltaX/Y: normalized movement */
  onDragPan: (deltaX: number, deltaY: number) => void;
  /** Called on double-click (reset) */
  onReset: () => void;
}

export interface MouseHandlerConfig {
  /** Enable mouse wheel zoom (default: true) */
  wheel?: boolean;
  /** Enable mouse drag pan (default: true) */
  drag?: boolean;
  /** Wheel zoom sensitivity (default: 0.001) */
  wheelSensitivity?: number;
}

export class MouseHandler {
  private canvas: HTMLCanvasElement;
  private callbacks: MouseCallbacks;
  private config: Required<MouseHandlerConfig>;
  private attached = false;

  // Drag state
  private isDragging = false;
  private lastPos = { x: 0, y: 0 };

  // Bound handlers (for removeEventListener)
  private boundHandleWheel: (e: WheelEvent) => void;
  private boundHandleMouseDown: (e: MouseEvent) => void;
  private boundHandleMouseMove: (e: MouseEvent) => void;
  private boundHandleMouseUp: () => void;
  private boundHandleDblClick: (e: MouseEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: MouseCallbacks,
    config: MouseHandlerConfig = {}
  ) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.config = {
      wheel: config.wheel ?? true,
      drag: config.drag ?? true,
      wheelSensitivity: config.wheelSensitivity ?? 0.001,
    };

    // Bind handlers once
    this.boundHandleWheel = this.handleWheel.bind(this);
    this.boundHandleMouseDown = this.handleMouseDown.bind(this);
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
    this.boundHandleMouseUp = this.handleMouseUp.bind(this);
    this.boundHandleDblClick = this.handleDblClick.bind(this);
  }

  /**
   * Attach event listeners to canvas
   * @returns Cleanup function
   */
  attach(): () => void {
    if (this.attached) {
      return () => this.detach();
    }

    if (this.config.wheel) {
      this.canvas.addEventListener('wheel', this.boundHandleWheel, { passive: false });
    }

    if (this.config.drag) {
      this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
      this.canvas.addEventListener('dblclick', this.boundHandleDblClick);
    }

    this.attached = true;

    return () => this.detach();
  }

  /**
   * Detach all event listeners
   */
  detach(): void {
    if (!this.attached) return;

    this.canvas.removeEventListener('wheel', this.boundHandleWheel);
    this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown);
    this.canvas.removeEventListener('dblclick', this.boundHandleDblClick);
    document.removeEventListener('mousemove', this.boundHandleMouseMove);
    document.removeEventListener('mouseup', this.boundHandleMouseUp);

    this.isDragging = false;
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
  // Event Handlers
  // ============================================================

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const cursorX = (e.clientX - rect.left) / rect.width;
    const cursorY = (e.clientY - rect.top) / rect.height;

    // Calculate zoom delta using sensitivity
    const zoomDelta = -e.deltaY * this.config.wheelSensitivity;

    this.callbacks.onWheelZoom(zoomDelta, cursorX, cursorY);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return; // Left click only
    e.preventDefault();
    this.isDragging = true;
    this.lastPos = { x: e.clientX, y: e.clientY };
    document.addEventListener('mousemove', this.boundHandleMouseMove);
    document.addEventListener('mouseup', this.boundHandleMouseUp);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const deltaX = (e.clientX - this.lastPos.x) / rect.width;
    const deltaY = (e.clientY - this.lastPos.y) / rect.height;
    this.lastPos = { x: e.clientX, y: e.clientY };
    this.callbacks.onDragPan(deltaX, deltaY);
  }

  private handleMouseUp(): void {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.boundHandleMouseMove);
    document.removeEventListener('mouseup', this.boundHandleMouseUp);
  }

  private handleDblClick(e: MouseEvent): void {
    e.preventDefault();
    this.callbacks.onReset();
  }
}
