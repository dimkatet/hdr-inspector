/**
 * Export Manager
 *
 * Manages image export operations (PNG, JPEG, custom formats via callback)
 */

import type { PixelReadbackService } from '../render/PixelReadbackService';
import type { ExportAPI, ExportOptions, PixelReadback, RenderState } from '../types';

export class ExportManager implements ExportAPI {
  constructor(
    private readbackService: PixelReadbackService,
    private getSettings: () => RenderState
  ) {}

  /**
   * Export rendered image as Blob
   *
   * Default: PNG via Canvas API (zero dependencies)
   * Custom: User-provided encoder callback
   *
   * @param options - Export options (type, quality, custom encoder)
   * @returns Promise<Blob>
   */
  async toBlob(options?: ExportOptions): Promise<Blob> {
    // 1. Read pixels from GPU (full image, readback service handles viewport)
    const pixelData = await this.readbackService.readPixels(this.getSettings());

    // 3. If custom encoder provided, use it
    if (options?.encoder) {
      return await options.encoder(pixelData);
    }

    // 4. Default path: PNG/JPEG via Canvas API
    return await this.exportViaPNG(pixelData, options);
  }

  /**
   * Export pixels to PNG or JPEG using Canvas API
   *
   * @param data - Pixel data from GPU
   * @param options - Export options (type, quality)
   * @returns Promise<Blob>
   */
  private async exportViaPNG(
    data: PixelReadback,
    options?: { quality?: number; type?: 'image/png' | 'image/jpeg' }
  ): Promise<Blob> {
    // Convert pixel data to Uint8ClampedArray for ImageData
    const pixelsU8 = this.convertToUint8ClampedArray(data);

    // Create offscreen canvas
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(data.width, data.height)
        : this.createFallbackCanvas(data.width, data.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for export');
    }

    // Create ImageData and draw to canvas
    // Note: Create fresh Uint8ClampedArray to ensure proper ArrayBuffer type
    const imageData = new ImageData(new Uint8ClampedArray(pixelsU8), data.width, data.height);
    ctx.putImageData(imageData, 0, 0);

    // Export to blob
    const type = options?.type ?? 'image/png';
    const quality = options?.quality ?? 0.92;

    if (typeof OffscreenCanvas !== 'undefined') {
      return await (canvas as OffscreenCanvas).convertToBlob({
        type,
        quality,
      });
    }

    // Fallback for environments without OffscreenCanvas
    return await this.canvasToBlob(canvas as HTMLCanvasElement, type, quality);
  }

  /**
   * Convert PixelReadback data to Uint8ClampedArray for ImageData
   *
   * Handles:
   * - Float32Array (HDR) → tone map to [0, 255]
   * - Uint16Array (16-bit) → downscale to [0, 255]
   * - Uint8Array → direct copy
   * - BGRA → RGBA conversion
   */
  private convertToUint8ClampedArray(data: PixelReadback): Uint8ClampedArray {
    const { pixels, width, height } = data;
    const pixelCount = width * height * 4; // RGBA

    // If already Uint8Array, create new Uint8ClampedArray copy
    if (pixels instanceof Uint8Array) {
      // Note: WebGPU may return BGRA for certain formats, need to check and swap
      return new Uint8ClampedArray(pixels);
    }

    // Uint16Array: scale 16-bit [0, 65535] → [0, 255]
    if (pixels instanceof Uint16Array) {
      const result = new Uint8ClampedArray(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        result[i] = Math.round(pixels[i] / 257); // 65535/255 = 257
      }
      return result;
    }

    // For Float16Array or Float32Array (HDR), clamp to [0,1] → [0,255]
    // Note: HDR values > 1.0 are clamped — HDR range lost for PNG/JPEG export
    if (pixels instanceof Float16Array || pixels instanceof Float32Array) {
      const result = new Uint8ClampedArray(pixelCount);
      for (let i = 0; i < pixelCount; i++) {
        result[i] = Math.round(Math.min(Math.max(pixels[i], 0), 1) * 255);
      }
      return result;
    }

    throw new Error('Unsupported pixel format');
  }

  /**
   * Fallback canvas creation for environments without OffscreenCanvas
   */
  private createFallbackCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * Fallback blob conversion for HTMLCanvasElement
   */
  private canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        },
        type,
        quality
      );
    });
  }
}
