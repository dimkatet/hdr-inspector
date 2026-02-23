/**
 * Render Domain Types
 *
 * Types for render settings, tone mapping, and visualization
 */

import type { RendererService } from '../../render/Renderer';

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
 * Object-fit mode for image display within the canvas.
 * Controls how the image maps to the canvas at the base zoom level (zoom=1).
 *
 * - 'contain': Fit entire image within canvas, letterbox/pillarbox as needed (default)
 * - 'cover': Fill canvas completely, crop excess edges
 * - 'fill': Stretch image to fill canvas (no aspect ratio preservation)
 * - 'none': Display at natural size (1:1 pixel mapping), centered
 * - 'scale-down': Like 'contain' but never upscale small images
 */
export type ObjectFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

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
  /** Object-fit mode for image display (default: 'contain') */
  objectFit?: ObjectFit;
  /** Enable transparent background */
  transparent?: boolean;
  /** Enable debug logging to console (default: false) */
  debug?: boolean;
  /**
   * Custom rendering backend. Defaults to WebGPU renderer.
   *
   * Use this to substitute an alternative backend (WebGL, WASM CPU, etc.).
   * The backend must implement both `Renderer` and `RuntimeService` interfaces.
   *
   * @see RendererService
   */
  renderer?: RendererService;
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
  objectFit: ObjectFit;
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
  /** Set object-fit mode (contain, cover, fill, none, scale-down) */
  setObjectFit(mode: ObjectFit): void;
  /** Batch update multiple render options */
  updateOptions(options: Partial<HDRCanvasOptions>): void;
}
