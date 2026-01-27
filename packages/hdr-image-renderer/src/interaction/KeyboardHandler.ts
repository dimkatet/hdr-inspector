/**
 * KeyboardHandler - Keyboard event handling for canvas navigation
 *
 * Handles keyboard shortcuts for pan, zoom, and viewport control.
 * Configurable key bindings with sensible defaults.
 */

export interface KeyboardCallbacks {
  /** Called when pan is requested. deltaX/Y: normalized movement */
  onPan: (deltaX: number, deltaY: number) => void;
  /** Called when zoom in is requested */
  onZoomIn: () => void;
  /** Called when zoom out is requested */
  onZoomOut: () => void;
  /** Called when zoom to fit is requested */
  onZoomToFit: () => void;
  /** Called when zoom to actual (1:1) is requested */
  onZoomToActual: () => void;
  /** Called when reset is requested */
  onReset: () => void;
}

export interface KeyboardConfig {
  /** Enable keyboard controls (default: true) */
  enabled?: boolean;
  /** Keys for pan up (default: ['ArrowUp', 'w', 'W']) */
  panUp?: string | string[];
  /** Keys for pan down (default: ['ArrowDown', 's', 'S']) */
  panDown?: string | string[];
  /** Keys for pan left (default: ['ArrowLeft', 'a', 'A']) */
  panLeft?: string | string[];
  /** Keys for pan right (default: ['ArrowRight', 'd', 'D']) */
  panRight?: string | string[];
  /** Keys for zoom in (default: ['+', '=']) */
  zoomIn?: string | string[];
  /** Keys for zoom out (default: ['-', '_']) */
  zoomOut?: string | string[];
  /** Keys for zoom to fit (default: ['0']) */
  zoomToFit?: string | string[];
  /** Keys for zoom to actual (default: ['1']) */
  zoomToActual?: string | string[];
  /** Keys for reset viewport (default: ['r', 'R']) */
  reset?: string | string[];
  /** Pan step size in normalized units (default: 0.1 = 10% of canvas) */
  panStep?: number;
}

interface NormalizedKeyboardConfig {
  enabled: boolean;
  panUp: Set<string>;
  panDown: Set<string>;
  panLeft: Set<string>;
  panRight: Set<string>;
  zoomIn: Set<string>;
  zoomOut: Set<string>;
  zoomToFit: Set<string>;
  zoomToActual: Set<string>;
  reset: Set<string>;
  panStep: number;
}

export class KeyboardHandler {
  private element: HTMLElement;
  private callbacks: KeyboardCallbacks;
  private config: NormalizedKeyboardConfig;
  private attached = false;

  // Bound handler (for removeEventListener)
  private boundHandleKeyDown: (e: KeyboardEvent) => void;

  constructor(element: HTMLElement, callbacks: KeyboardCallbacks, config: KeyboardConfig = {}) {
    this.element = element;
    this.callbacks = callbacks;
    this.config = this.normalizeConfig(config);

    // Bind handler once
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Normalize config, converting string | string[] to Set and applying defaults
   */
  private normalizeConfig(config: KeyboardConfig): NormalizedKeyboardConfig {
    const toSet = (value: string | string[] | undefined, defaults: string[]): Set<string> => {
      if (value === undefined) return new Set(defaults);
      return new Set(Array.isArray(value) ? value : [value]);
    };

    return {
      enabled: config.enabled ?? true,
      panUp: toSet(config.panUp, ['ArrowUp', 'w', 'W']),
      panDown: toSet(config.panDown, ['ArrowDown', 's', 'S']),
      panLeft: toSet(config.panLeft, ['ArrowLeft', 'a', 'A']),
      panRight: toSet(config.panRight, ['ArrowRight', 'd', 'D']),
      zoomIn: toSet(config.zoomIn, ['+', '=']),
      zoomOut: toSet(config.zoomOut, ['-', '_']),
      zoomToFit: toSet(config.zoomToFit, ['0']),
      zoomToActual: toSet(config.zoomToActual, ['1']),
      reset: toSet(config.reset, ['r', 'R']),
      panStep: config.panStep ?? 0.1,
    };
  }

  /**
   * Attach event listener
   * @returns Cleanup function
   */
  attach(): () => void {
    if (this.attached || !this.config.enabled) {
      return () => this.detach();
    }

    // Make element focusable if not already
    if (!this.element.hasAttribute('tabindex')) {
      this.element.setAttribute('tabindex', '0');
    }

    // Focus canvas on click (canvas doesn't auto-focus like input elements)
    const onClick = () => this.element.focus();

    this.element.addEventListener('click', onClick);
    this.element.addEventListener('keydown', this.boundHandleKeyDown);

    this.attached = true;

    return () => {
      this.element.removeEventListener('click', onClick);
      this.detach();
    };
  }

  /**
   * Detach event listener
   */
  detach(): void {
    if (!this.attached) return;

    this.element.removeEventListener('keydown', this.boundHandleKeyDown);
    this.attached = false;
  }

  /**
   * Check if handler is attached
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
  // Event Handler
  // ============================================================

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key;

    // Ignore if modifier keys are pressed (except Shift for uppercase)
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    let handled = false;

    // Pan controls
    if (this.config.panUp.has(key)) {
      this.callbacks.onPan(0, this.config.panStep);
      handled = true;
    } else if (this.config.panDown.has(key)) {
      this.callbacks.onPan(0, -this.config.panStep);
      handled = true;
    } else if (this.config.panLeft.has(key)) {
      this.callbacks.onPan(this.config.panStep, 0);
      handled = true;
    } else if (this.config.panRight.has(key)) {
      this.callbacks.onPan(-this.config.panStep, 0);
      handled = true;
    }
    // Zoom controls
    else if (this.config.zoomIn.has(key)) {
      this.callbacks.onZoomIn();
      handled = true;
    } else if (this.config.zoomOut.has(key)) {
      this.callbacks.onZoomOut();
      handled = true;
    } else if (this.config.zoomToFit.has(key)) {
      this.callbacks.onZoomToFit();
      handled = true;
    } else if (this.config.zoomToActual.has(key)) {
      this.callbacks.onZoomToActual();
      handled = true;
    } else if (this.config.reset.has(key)) {
      this.callbacks.onReset();
      handled = true;
    }

    // Prevent default browser behavior if we handled the key
    if (handled) {
      e.preventDefault();
    }
  }
}
