/**
 * ImageLoader - Static utility for decoding image files
 *
 * Provides file format detection and decoding for HDR image formats.
 * Currently supports Radiance HDR (.hdr, .pic), future: OpenEXR.
 */

import type { LinearImageData } from '../types';
import { decodeRadianceHDR } from './decoders';

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class ImageLoader {
  /**
   * Decode image file with auto-detection of format
   * @param file - File object to decode
   * @returns Decoded linear image data
   * @throws Error if format is unsupported
   */
  static async decodeFile(file: File): Promise<LinearImageData> {
    const buffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'hdr' || ext === 'pic') {
      return ImageLoader.decodeRadianceHDR(buffer);
    }

    throw new Error(`Unsupported file format: ${ext}`);
  }

  /**
   * Decode Radiance HDR format (.hdr, .pic)
   * @param buffer - ArrayBuffer containing HDR file data
   * @returns Decoded linear image data
   */
  static async decodeRadianceHDR(buffer: ArrayBuffer): Promise<LinearImageData> {
    return decodeRadianceHDR(buffer);
  }

  // Future: OpenEXR support
  // static async decodeOpenEXR(buffer: ArrayBuffer): Promise<LinearImageData> {
  //   // TODO: Implement OpenEXR decoder
  //   throw new Error('OpenEXR support not yet implemented');
  // }
}
