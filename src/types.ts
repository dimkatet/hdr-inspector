/**
 * HDR Inspector - Type Definitions
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
export interface LinearImage {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Linear RGB data (Float32Array, interleaved RGB) */
  data: Float32Array;
  /** Number of channels (3 for RGB, 4 for RGBA) */
  channels: 3 | 4;
}

/**
 * Supported HDR file formats
 */
export type HDRFormat = 'exr' | 'hdr';

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
 * Renderer state
 */
export interface RenderState {
  /** Exposure value in stops (EV) */
  exposure: number;
  /** Tone mapping operator */
  toneMapping: ToneMappingOperator;
  /** Visualization mode */
  mode: VisualizationMode;
  /** HDR mode enabled */
  hdrMode: boolean;
  /** Color space for rendering */
  colorSpace: ColorSpace;
}

/**
 * Luminance statistics
 */
export interface LuminanceStats {
  /** Minimum luminance value */
  min: number;
  /** Maximum luminance value */
  max: number;
  /** Average luminance */
  average: number;
  /** Median luminance */
  median: number;
  /** Log-average luminance (geometric mean) */
  logAverage: number;
}

/**
 * Histogram data
 */
export interface Histogram {
  /** Histogram bins (linear luminance) */
  bins: number[];
  /** Histogram bins (log luminance) */
  logBins: number[];
  /** Bin edges for linear histogram */
  binEdges: number[];
  /** Bin edges for log histogram */
  logBinEdges: number[];
}

/**
 * Image analysis results
 */
export interface ImageAnalysis {
  /** Luminance statistics */
  stats: LuminanceStats;
  /** Histogram data */
  histogram: Histogram;
}
