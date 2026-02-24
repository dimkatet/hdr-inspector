/**
 * Image Domain Types
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
  /** Linear RGB data (Float16Array or Float32Array, interleaved RGB or RGBA) */
  data: Float16Array | Float32Array;
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
