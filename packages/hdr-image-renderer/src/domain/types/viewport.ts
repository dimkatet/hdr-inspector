/**
 * Viewport Domain Types
 *
 * Types for viewport state, mutations, and control
 */

/**
 * Easing function for animations
 */
export type EasingFunction = 'linear' | 'ease-out';

/**
 * Source of viewport mutation (where it originated from)
 */
export type MutationSource =
  | 'wheel'
  | 'pinch'
  | 'drag'
  | 'keyboard'
  | 'button'
  | 'dblclick'
  | 'doubletap'
  | 'programmatic';

/**
 * Viewport state for zoom/pan
 */
export interface ViewportState {
  /** Zoom level (1.0 = 100%, 2.0 = 200%, etc.) */
  zoom: number;
  /** Pan offset X in normalized coordinates [-1, 1] */
  panX: number;
  /** Pan offset Y in normalized coordinates [-1, 1] */
  panY: number;
}

/**
 * Configuration for viewport controller
 */
export interface ViewportConfig {
  /** Minimum zoom level (default: 0.1) */
  minZoom?: number;
  /** Maximum zoom level (default: 10) */
  maxZoom?: number;
  /** Animation duration in milliseconds (default: 200) */
  animationDuration?: number;
  /** Easing function for animations (default: 'ease-out') */
  easing?: EasingFunction;
}

/**
 * Viewport mutations - primitive operations on viewport state
 */
export type ViewportMutation =
  | {
      type: 'zoom';
      /** Target zoom level */
      zoom: number;
      /** Center X in normalized coordinates [0,1] (optional, defaults to 0.5) */
      centerX?: number;
      /** Center Y in normalized coordinates [0,1] (optional, defaults to 0.5) */
      centerY?: number;
      /** Source of the mutation */
      source: MutationSource;
      /** Animation duration in ms (optional, uses config default) */
      duration?: number;
    }
  | {
      type: 'pan';
      /** Pan delta X in normalized coordinates */
      deltaX: number;
      /** Pan delta Y in normalized coordinates */
      deltaY: number;
      /** Source of the mutation */
      source: MutationSource;
      /** Animation duration in ms (optional, uses config default or 0 for instant) */
      duration?: number;
    }
  | {
      type: 'reset';
      /** Source of the mutation */
      source: MutationSource;
      /** Animation duration in ms (optional, uses config default) */
      duration?: number;
    };

/**
 * Listener for viewport updates
 */
export type UpdateListener = (state: ViewportState) => void;

/**
 * Listener for viewport mutations
 */
export type MutationListener = (
  mutation: ViewportMutation,
  prev: ViewportState,
  target: ViewportState
) => void;

/**
 * Listener for animation completion events.
 * Called when an animated transition finishes (not called for instant transitions).
 */
export type TransitionEndListener = (state: ViewportState) => void;

/**
 * Viewport control API
 * Manages zoom, pan, and viewport state
 */
export interface ViewportAPI {
  // State
  /** Get current viewport state (zoom, panX, panY) */
  getState(): ViewportState;
  /** Update viewport configuration (minZoom, maxZoom, animation settings) */
  setConfig(config: Partial<ViewportConfig>): void;

  // Commands (instant)
  /** Set zoom level (instant, no animation) */
  setZoom(zoom: number): void;
  /** Set pan offset (instant, no animation) */
  setPan(x: number, y: number): void;
  /** Set complete viewport state (instant, no animation) */
  setViewport(viewport: Partial<ViewportState>): void;

  // Commands (animated)
  /** Zoom in by factor (default: 2x, animated) */
  zoomIn(factor?: number): void;
  /** Zoom out by factor (default: 2x, animated) */
  zoomOut(factor?: number): void;
  /** Zoom to fit entire image in canvas (animated) */
  zoomToFit(): void;
  /** Zoom to actual size, 1:1 pixel mapping (animated) */
  zoomToActual(): void;
  /** Reset viewport to default state (zoom 1, no pan) */
  reset(animated?: boolean): void;
}
