/**
 * HDR Canvas - Type Definitions
 *
 * Core types for scene-referred linear HDR image processing.
 * All color values are linear, scene-referred unless explicitly stated otherwise.
 */

/**
 * Linear RGB image data
 * - Scene-referred, no transfer function applied
 * - Values may exceed 1.0
 * - Format: RGBRGBRGB... (interleaved)
 */
export interface LinearImageData {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Linear RGB data (Float32Array, interleaved RGB or RGBA) */
  data: Float32Array;
  /** Number of channels (3 for RGB, 4 for RGBA) */
  channels: 3 | 4;
  /** Optional metadata */
  metadata?: {
    exposure?: number;
    colorSpace?: string;
  };
}

/**
 * Tone mapping operators
 */
export type ToneMappingOperator = 'none' | 'reinhard' | 'aces';

/**
 * Visualization modes
 */
export type VisualizationMode = 'rgb' | 'luminance' | 'clipping';

/**
 * Color space for rendering
 */
export type ColorSpace = 'srgb' | 'display-p3' | 'rec2020';

/**
 * Options for HDRCanvas initialization
 */
export interface HDRCanvasOptions {
  /** Enable HDR mode (requires HDR-capable display) */
  hdrMode?: boolean;
  /** Exposure value in stops (EV) */
  exposure?: number;
  /** Tone mapping operator */
  toneMapping?: ToneMappingOperator;
  /** Color space for rendering */
  colorSpace?: ColorSpace;
  /** Visualization mode */
  visualizationMode?: VisualizationMode;
  /** Enable transparent background */
  transparent?: boolean;
}

/**
 * Current render state
 */
export interface RenderState {
  exposure: number;
  toneMapping: ToneMappingOperator;
  visualizationMode: VisualizationMode;
  hdrMode: boolean;
  colorSpace: ColorSpace;
}

export type UpdateListener = (state: ViewportState) => void;

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
 * Easing function for animations
 */
export type EasingFunction = 'linear' | 'ease-out';

/**
 * Source of viewport mutation (where it originated from)
 */
export type MutationSource = 'wheel' | 'pinch' | 'drag' | 'keyboard' | 'button' | 'dblclick' | 'doubletap' | 'programmatic';

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
 * Image metadata returned on load
 */
export interface ImageInfo {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Aspect ratio (width / height) */
  aspectRatio: number;
}

/**
 * Configuration for wheel zoom
 */
export interface WheelConfig {
  /** Enable wheel zoom (default: true) */
  enabled?: boolean;
  /** Wheel zoom sensitivity (default: 0.001) */
  sensitivity?: number;
}

/**
 * Configuration for mouse interactions
 */
export interface MouseConfig {
  /** Enable/configure mouse wheel zoom (true for defaults, object for custom config) */
  wheel?: boolean | WheelConfig;
  /** Enable mouse drag pan (default: true) */
  drag?: boolean;
}

/**
 * Configuration for touch interactions
 */
export interface TouchConfig {
  /** Enable touch gestures (pinch, pan, double-tap) (default: true) */
  enabled?: boolean;
}

/**
 * Configuration for keyboard controls
 */
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

/**
 * Options for attachInteractions()
 */
export interface InteractionOptions extends ViewportConfig {
  /** Enable/configure mouse wheel zoom (true for defaults, object for custom config) */
  wheel?: boolean | WheelConfig;
  /** Enable mouse drag pan (default: true) */
  drag?: boolean;
  /** Enable touch gestures (default: true) */
  touch?: boolean;
  /** Keyboard control configuration (true for defaults, object for custom config) */
  keyboard?: boolean | KeyboardConfig;
}
