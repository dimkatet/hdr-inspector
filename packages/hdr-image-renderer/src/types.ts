/**
 * HDR Canvas - Type Definitions
 *
 * Core types for scene-referred linear HDR image processing.
 * All color values are linear, scene-referred unless explicitly stated otherwise.
 */

/**
 * Transfer function for encoded image data
 */
export type TransferFunction = 'linear' | 'srgb' | 'pq';

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
  /** Transfer function (always 'linear' for this type) */
  transferFunction: 'linear';
  /** Optional metadata */
  metadata?: {
    exposure?: number;
    colorSpace?: string;
  };
}

/**
 * Encoded RGB(A) image data
 * - Display-referred with transfer function applied
 * - Raw uint8/uint16 values (0-255 or 0-65535)
 * - GPU will normalize and apply EOTF to convert to linear
 */
export interface EncodedImageData {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Encoded RGB(A) data (raw values, not normalized) */
  data: Uint8Array | Uint16Array;
  /** Number of channels (3 for RGB, 4 for RGBA) */
  channels: 3 | 4;
  /** Transfer function applied to the data */
  transferFunction: 'srgb' | 'pq';
  /**
   * Bit depth of the encoded data (8, 10, 12, or 16 bits per channel)
   * For Uint8Array: always 8
   * For Uint16Array: can be 10, 12, or 16 (actual bit depth may differ from container size)
   * If not specified, assumes full bit depth (8 for Uint8Array, 16 for Uint16Array)
   */
  bitDepth?: 8 | 10 | 12 | 16;
  /** Optional metadata */
  metadata?: {
    colorSpace?: string;
  };
}

/**
 * Union type for all supported image data formats
 */
export type ImageData = LinearImageData | EncodedImageData;

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
  /** Enable debug logging to console (default: false) */
  debug?: boolean;
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

// ============================================================
// Namespaced API Interfaces
// ============================================================

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

  // Events
  /** Subscribe to zoom changes (throttled for wheel/pinch, immediate for buttons) */
  onZoom(callback: (zoom: number, state: ViewportState) => void, throttleMs?: number): () => void;
  /** Subscribe to pan changes (throttled for drag) */
  onPan(callback: (panX: number, panY: number, state: ViewportState) => void, throttleMs?: number): () => void;
  /** Subscribe to viewport updates (fires every animation frame) */
  onUpdate(callback: (state: ViewportState) => void): () => void;
  /** Subscribe to all viewport mutations (low-level, fires before animation) */
  onMutation(listener: MutationListener): () => void;
  /** Subscribe to animation completion events */
  onTransitionEnd(listener: TransitionEndListener): () => void;
  /** Subscribe to reset events */
  onReset(callback: (state: ViewportState) => void): () => void;

  // Filtered events (convenience)
  /** Subscribe to wheel zoom events only */
  onWheelZoom(callback: (zoom: number, state: ViewportState) => void): () => void;
  /** Subscribe to button/programmatic zoom events only */
  onButtonZoom(callback: (zoom: number, state: ViewportState) => void): () => void;
  /** Subscribe to drag pan events only */
  onDragPan(callback: (panX: number, panY: number, state: ViewportState) => void): () => void;
}

/**
 * Render settings API
 * Controls exposure, tone mapping, and visualization
 */
export interface RenderAPI {
  /** Get current render state (exposure, toneMapping, hdrMode, etc.) */
  getState(): RenderState;
  /** Set exposure value in stops (EV) */
  setExposure(ev: number): void;
  /** Set tone mapping operator (none, reinhard, aces) */
  setToneMapping(operator: ToneMappingOperator): void;
  /** Enable/disable HDR mode (requires HDR-capable display) */
  setHDRMode(enabled: boolean): void;
  /** Set output color space (srgb, display-p3, rec2020) */
  setColorSpace(space: ColorSpace): void;
  /** Set visualization mode (rgb, luminance, clipping) */
  setVisualizationMode(mode: VisualizationMode): void;
  /** Batch update multiple render options */
  updateOptions(options: Partial<HDRCanvasOptions>): void;
}

/**
 * Interaction management API
 * Handles mouse, touch, and keyboard interactions
 */
export interface InteractionAPI {
  /** Attach interaction handlers (wheel, drag, touch, keyboard) and return cleanup function */
  attach(options?: InteractionOptions): () => void;
  /** Detach all interaction handlers */
  detach(): void;
}

/**
 * Canvas control API
 * Canvas-specific operations (auto-resize, image info, etc.)
 */
export interface CanvasAPI {
  /** Enable automatic canvas resize based on CSS layout (returns cleanup function) */
  enableAutoResize(): () => void;
  /** Disable automatic canvas resize */
  disableAutoResize(): void;
  /** Get loaded image dimensions */
  getImageDimensions(): { width: number; height: number };
  /** Get loaded image info (dimensions + aspect ratio) */
  getImageInfo(): ImageInfo;
  /** Force re-render (e.g., after manual canvas resize) */
  forceRender(): void;
}

// ============================================================
// Image Loading Types
// ============================================================

/**
 * Image loader function
 * User-provided function that loads and decodes image data.
 * Receives an AbortSignal for cancellation support.
 */
export type ImageLoader = (signal?: AbortSignal) => Promise<ImageData>;

/**
 * Options for async image loading
 */
export interface LoadOptions {
  /** Image to display while loading (placeholder) */
  placeholder?: ImageData;
  /** Image to display if loading fails (error fallback) */
  errorFallback?: ImageData;
  /** Timeout in milliseconds (rejects if exceeded) */
  timeout?: number;
}

/**
 * Type of image currently displayed
 */
export type DisplayedImageType = 'none' | 'placeholder' | 'main' | 'error-fallback';

/**
 * Loading state for async image operations
 */
export interface LoadingState {
  /** Current loading status */
  status: 'idle' | 'loading' | 'success' | 'error';
  /** Error if status is 'error' */
  error?: Error;
  /** Which image is currently displayed */
  displayedImage: DisplayedImageType;
}

/**
 * Listener for loading state changes
 */
export type LoadingStateListener = (state: LoadingState) => void;

/**
 * Image loading API
 * Manages async image loading with placeholder and error fallback support
 */
export interface LoadingAPI {
  /**
   * Load image using a user-provided loader function.
   * Optionally shows placeholder while loading and errorFallback on failure.
   * @param loader - Function that returns Promise<ImageData>
   * @param options - Loading options (placeholder, errorFallback, timeout)
   * @returns Promise that resolves with ImageInfo on success
   */
  load(loader: ImageLoader, options?: LoadOptions): Promise<ImageInfo>;

  /** Cancel current loading operation */
  cancel(): void;

  /** Get current loading state */
  getState(): LoadingState;

  /** Subscribe to loading state changes (returns unsubscribe function) */
  onStateChange(callback: LoadingStateListener): () => void;
}
