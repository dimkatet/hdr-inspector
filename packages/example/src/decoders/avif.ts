/**
 * AVIF decoder wrapper
 *
 * Wraps @jsquash/avif to provide unified API for @dimkatet/hdr-image-renderer
 *
 * @see https://github.com/jamsinclair/jSquash
 * @see https://www.npmjs.com/package/@jsquash/avif
 */

import { decodeInWorker, initWorkerPool } from "@dimkatet/jcodecs-avif";
// import { decode as slowDecode} from '@jsquash/avif'
import { DecodeError, type DecodeResult } from "./types";
import type { EncodedImageData } from "@dimkatet/hdr-image-renderer";

await initWorkerPool({
  poolSize: navigator.hardwareConcurrency || 4,
});

/**
 * Decode AVIF image to LinearImageData (for HDR content) or EncodedImageData (for SDR content)
 *
 * @param buffer - ArrayBuffer containing AVIF file data
 * @param options - Decoding options
 * @returns Promise resolving to decoded image data
 *
 * @example
 * ```typescript
 * import { decode } from '@dimkatet/hdr-decoders/avif'
 *
 * const response = await fetch('image.avif')
 * const buffer = await response.arrayBuffer()
 * const result = await decode(buffer)
 *
 * // Use with HDRCanvas
 * canvas.loadImage(result.data)
 * ```
 */

export async function decode(
  buffer: ArrayBuffer,
): Promise<DecodeResult<EncodedImageData>> {
  try {
    // const decoded = await decode2(buffer);
    const decoded = await decodeInWorker(buffer);
    if (!decoded) {
      throw new Error("Failed to decode AVIF: decoder returned null");
    }

    const { data, width, height, metadata, channels, bitDepth } = decoded;

    const imageData: EncodedImageData = {
      data,
      width,
      height,
      channels: channels as 3 | 4,
      transferFunction: metadata.transferFunction as "srgb" | "pq",
      bitDepth, // Pass actual bit depth to renderer
    };

    return {
      data: imageData,
      width,
      height,
      colorSpace: metadata.colorPrimaries as
        | "srgb"
        | "display-p3"
        | "rec2020"
        | undefined,
      bitDepth,
    };
  } catch (error) {
    throw new DecodeError(
      `Failed to decode AVIF image: ${error instanceof Error ? error.message : String(error)}`,
      "avif",
      error,
    );
  }
}

/**
 * Check if buffer contains valid AVIF data
 *
 * @param buffer - ArrayBuffer to check
 * @returns true if buffer starts with AVIF magic bytes
 */
export function isAVIF(buffer: ArrayBuffer): boolean {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) return false;

  // Check for ftyp box at offset 4
  const ftyp = String.fromCharCode(
    view.getUint8(4),
    view.getUint8(5),
    view.getUint8(6),
    view.getUint8(7),
  );

  if (ftyp !== "ftyp") return false;

  // Check for avif/avis brand
  const brand = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11),
  );

  return brand === "avif" || brand === "avis";
}

export { DecodeError } from "./types";
export type { DecodeResult } from "./types";
