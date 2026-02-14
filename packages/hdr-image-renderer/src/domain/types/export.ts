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
  /** Raw pixel data (format depends on render mode: Uint8Array for SDR, Float32Array/Uint16Array for HDR) */
  pixels: Uint8Array | Uint16Array | Float32Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** GPU texture format (bgra8unorm/rgba8unorm for SDR, rgba16float for HDR) */
  format: GPUTextureFormat;
  /** Color space used for rendering */
  colorSpace: ColorSpace;
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
