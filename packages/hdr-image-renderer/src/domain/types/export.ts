/**
 * Export Domain Types
 *
 * Types for image export functionality (PNG, JPEG, custom formats)
 */

import type { ColorSpace } from './render';

/**
 * Pixel data read from GPU
 */
export interface PixelReadback {
  /** Raw pixel data (format depends on render mode: Uint8Array for SDR, Float16Array for HDR rgba16float) */
  pixels: Uint8Array | Uint16Array | Float16Array | Float32Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** GPU texture format (bgra8unorm/rgba8unorm for SDR, rgba16float for HDR) */
  format: GPUTextureFormat;
  /** Color space used for rendering */
  colorSpace: ColorSpace;
  /** Original bit depth of the source data (8, 10, 12, 16). For float outputs, always 16. */
  bitDepth: number;
}

/**
 * Encoder callback for custom image formats
 * Receives pixel data + metadata, returns encoded Blob
 *
 * Example (JXL encoder):
 * ```typescript
 * const encoder: ImageEncoder = async (data) => {
 *   const jxl = await encodeJXL({
 *     width: data.width,
 *     height: data.height,
 *     pixels: data.pixels,
 *     colorSpace: data.colorSpace,
 *   });
 *   return new Blob([jxl], { type: 'image/jxl' });
 * };
 * ```
 */
export type ImageEncoder = (data: PixelReadback) => Promise<Blob>;

/**
 * Options for image export
 */
export interface ExportOptions {
  /** MIME type for built-in export (default: 'image/png') */
  type?: 'image/png' | 'image/jpeg';
  /** Quality for JPEG (0-1, default: 0.92) */
  quality?: number;
  /** Custom encoder for advanced formats (JXL, EXR, etc.) */
  encoder?: ImageEncoder;
}

/**
 * Options for download-triggered export (extends ExportOptions with filename)
 */
export interface ExportDownloadOptions extends ExportOptions {
  /**
   * Base filename without extension (default: `hdr-export-<timestamp>`).
   */
  filename?: string;
  /**
   * File extension override (without dot).
   * Default: derived from `type` ('png'/'jpg') or 'bin' for custom encoders.
   * Use this when providing a custom encoder with a known format (e.g., 'jxl', 'avif', 'exr').
   *
   * @example
   * actions.download({ encoder: jxlEncoder, extension: 'jxl', filename: 'my-image' })
   * // → 'my-image.jxl'
   */
  extension?: string;
}

/**
 * Image export API
 * Export rendered image as Blob
 */
export interface ExportAPI {
  /**
   * Export rendered image to Blob
   *
   * Default behavior (no options):
   * - Exports as PNG using Canvas API
   * - Includes all render settings (exposure, tone mapping, color space)
   * - Exports full image (ignores current viewport/zoom)
   *
   * Custom encoder:
   * - Receives pixel data (TypedArray) + metadata
   * - Returns custom encoded Blob (e.g., JXL, EXR)
   *
   * @param options - Export options (type, quality, custom encoder)
   * @returns Promise<Blob>
   */
  toBlob(options?: ExportOptions): Promise<Blob>;
}
