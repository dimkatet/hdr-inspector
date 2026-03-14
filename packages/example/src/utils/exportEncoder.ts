/**
 * Encoder utilities for exporting rendered images to original source formats.
 *
 * Converts GPU PixelReadback → AutoImageData and delegates to jCodecs workers.
 */

import type { PixelReadback } from '@dimkatet/hdr-canvas';
import type { AutoImageData, ImageDescriptor, ImageFormat } from '@dimkatet/jcodecs-auto';
import { encode, getFormatExtension, getMimeType } from '@dimkatet/jcodecs-auto';

export const FORMAT_LABELS: Partial<Record<ImageFormat, string>> = {
  jxl: 'JPEG XL',
  avif: 'AVIF',
  exr: 'OpenEXR',
};

/** Formats that can be re-encoded back to source */
export const ENCODABLE_FORMATS: readonly ImageFormat[] = ['jxl', 'avif', 'exr'] as const;

/**
 * Convert GPU PixelReadback to AutoImageData for jCodecs encoding.
 *
 * - Float16Array → HDR (rgba16float canvas), linear, bitDepth 16
 * - Float32Array → HDR (future), linear, bitDepth 32
 * - Uint8Array   → SDR, RGBA (bgra→rgba already done by readback service), sRGB
 */
function readbackToAutoImageData(
  readback: PixelReadback,
  targetFormat: Exclude<ImageFormat, 'unknown'>,
  originalDescriptor: ImageDescriptor
): AutoImageData {
  if (readback.pixels instanceof Float16Array || readback.pixels instanceof Float32Array) {
    const isF16 = readback.pixels instanceof Float16Array;
    return {
      data: readback.pixels,
      format: targetFormat,
      descriptor: {
        geometry: { width: readback.width, height: readback.height },
        channels: { model: 'rgba', count: 4 },
        numeric: {
          sampleType: 'float',
          dataType: isF16 ? 'float16' : 'float32',
          bitDepth: readback.bitDepth,
        },
        transfer: { function: 'linear' },
        color: originalDescriptor.color,
      },
    };
  }

  if (readback.pixels instanceof Uint16Array) {
    return {
      data: readback.pixels,
      format: targetFormat,
      descriptor: {
        geometry: { width: readback.width, height: readback.height },
        channels: { model: 'rgba', count: 4 },
        numeric: {
          sampleType: 'uint',
          dataType: 'uint16',
          bitDepth: readback.bitDepth,
        },
        transfer: { function: originalDescriptor.transfer?.function ?? 'srgb' },
        color: originalDescriptor.color,
      },
    };
  }

  // Uint8Array — SDR, already RGBA
  return {
    data: readback.pixels,
    format: targetFormat,
    descriptor: {
      geometry: { width: readback.width, height: readback.height },
      channels: { model: 'rgba', count: 4 },
      numeric: { sampleType: 'uint', dataType: 'uint8', bitDepth: 8 },
      transfer: { function: 'srgb' },
      color: originalDescriptor.color,
    },
  };
}

/**
 * Create an ImageEncoder that re-encodes the rendered GPU output back to
 * the original source format using jCodecs workers.
 *
 * @param client     - AutoWorkerClient initialized with type: 'both'
 * @param format     - Target format (jxl / avif / exr)
 * @param descriptor - Original image descriptor from decoding (used for color primaries)
 */
export function createOriginalFormatEncoder(
  format: Exclude<ImageFormat, 'unknown'>,
  descriptor: ImageDescriptor
) {
  const mimeType = getMimeType(format);
  return async (readback: PixelReadback): Promise<Blob> => {
    console.log(
      `[export] readback pixels (${readback.pixels.constructor.name}, bitDepth=${readback.bitDepth}):`,
      readback.pixels.slice(0, 16)
    );
    const autoImageData = readbackToAutoImageData(readback, format, descriptor);
    const encoded = await encode(autoImageData, { format, avif: { quality: 99 }, jxl: { quality: 99 } });
    return new Blob([new Uint8Array(encoded).buffer], { type: mimeType });
  };
}

export { getFormatExtension };
