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
  width: number
  /** Image height in pixels */
  height: number
  /** Linear RGB data (Float32Array, interleaved RGB or RGBA) */
  data: Float32Array
  /** Number of channels (3 for RGB, 4 for RGBA) */
  channels: 3 | 4
  /** Optional metadata */
  metadata?: {
    exposure?: number
    colorSpace?: string
  }
}

/**
 * Tone mapping operators
 */
export type ToneMappingOperator = 'none' | 'reinhard' | 'aces'

/**
 * Visualization modes
 */
export type VisualizationMode = 'rgb' | 'luminance' | 'clipping'

/**
 * Color space for rendering
 */
export type ColorSpace = 'srgb' | 'display-p3' | 'rec2020'

/**
 * Options for HDRCanvas initialization
 */
export interface HDRCanvasOptions {
  /** Enable HDR mode (requires HDR-capable display) */
  hdrMode?: boolean
  /** Exposure value in stops (EV) */
  exposure?: number
  /** Tone mapping operator */
  toneMapping?: ToneMappingOperator
  /** Color space for rendering */
  colorSpace?: ColorSpace
  /** Visualization mode */
  visualizationMode?: VisualizationMode
  /** Enable transparent background */
  transparent?: boolean
}

/**
 * Current render state
 */
export interface RenderState {
  exposure: number
  toneMapping: ToneMappingOperator
  visualizationMode: VisualizationMode
  hdrMode: boolean
  colorSpace: ColorSpace
}

/**
 * Viewport state for zoom/pan
 */
export interface ViewportState {
  /** Zoom level (1.0 = 100%, 2.0 = 200%, etc.) */
  zoom: number
  /** Pan offset X in normalized coordinates [-1, 1] */
  panX: number
  /** Pan offset Y in normalized coordinates [-1, 1] */
  panY: number
}
