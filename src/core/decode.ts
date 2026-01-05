/**
 * HDR Image Decoders
 *
 * Decodes OpenEXR and Radiance HDR files into linear RGB Float32Array.
 * All output is scene-referred, linear, with no transfer function applied.
 */

import type { LinearImage } from '../types';

/**
 * Error thrown when decoding fails
 */
export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeError';
  }
}

/**
 * Decodes Radiance HDR (.hdr, .pic) file format (RGBE encoding)
 *
 * Format spec:
 * - ASCII header with KEY=VALUE pairs
 * - Blank line separator
 * - Resolution string: "-Y height +X width"
 * - Scanlines encoded as RGBE (4 bytes per pixel: R, G, B, E)
 * - E is shared exponent: RGB = (R, G, B) * 2^(E - 128)
 *
 * Assumptions:
 * - Color space: Linear BT.709 (no embedded color space support)
 * - Orientation: Standard (top-to-bottom)
 * - Exposure header is ignored (we control exposure explicitly)
 */
export async function decodeRadianceHDR(
  arrayBuffer: ArrayBuffer
): Promise<LinearImage> {
  const data = new Uint8Array(arrayBuffer);
  let offset = 0;

  // Parse ASCII header
  const header = parseHeader(data, offset);
  offset = header.offset;

  // Parse resolution string
  const resolution = parseResolution(data, offset);
  offset = resolution.offset;

  const { width, height } = resolution;
  const channels = 3; // RGB only (no alpha in Radiance HDR)

  // Decode scanlines
  const rgbData = new Float32Array(width * height * channels);
  const scanline = new Uint8Array(width * 4); // RGBE

  for (let y = 0; y < height; y++) {
    // Read scanline (may be RLE compressed)
    offset = readScanline(data, offset, width, scanline);

    // Convert RGBE to linear RGB
    for (let x = 0; x < width; x++) {
      const rgbeOffset = x * 4;
      const rgbOffset = (y * width + x) * 3;

      const r = scanline[rgbeOffset];
      const g = scanline[rgbeOffset + 1];
      const b = scanline[rgbeOffset + 2];
      const e = scanline[rgbeOffset + 3];

      if (e === 0) {
        // Special case: black pixel
        rgbData[rgbOffset] = 0;
        rgbData[rgbOffset + 1] = 0;
        rgbData[rgbOffset + 2] = 0;
      } else {
        // Standard RGBE decode: value * 2^(exponent - 128)
        const scale = Math.pow(2, e - 128) / 256;
        rgbData[rgbOffset] = r * scale;
        rgbData[rgbOffset + 1] = g * scale;
        rgbData[rgbOffset + 2] = b * scale;
      }
    }
  }

  // Compute min/max without stack overflow
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < rgbData.length; i++) {
    const val = rgbData[i];
    if (val !== undefined && val < min) min = val;
    if (val !== undefined && val > max) max = val;
  }

  console.log('[decodeRadianceHDR] Decoded image:', width, 'x', height);
  console.log('[decodeRadianceHDR] Data stats:', {
    min,
    max,
    length: rgbData.length,
    expected: width * height * 3,
  });

  return {
    width,
    height,
    data: rgbData,
    channels,
  };
}

/**
 * Parse Radiance HDR header
 * Header ends with a blank line
 */
function parseHeader(
  data: Uint8Array,
  offset: number
): { offset: number; header: Record<string, string> } {
  const header: Record<string, string> = {};
  let line = '';

  // Check magic number
  const magic = '#?RADIANCE\n';
  const magicBytes = data.slice(offset, offset + magic.length);
  const magicStr = new TextDecoder().decode(magicBytes);

  if (!magicStr.startsWith('#?')) {
    throw new DecodeError('Invalid Radiance HDR file: missing magic number');
  }

  // Parse header lines
  while (offset < data.length) {
    const byte = data[offset++];

    if (byte === 0x0a) {
      // Newline
      if (line.trim() === '') {
        // Blank line marks end of header
        break;
      }

      // Parse KEY=VALUE
      const match = line.match(/^(\w+)=(.+)$/);
      if (match) {
        header[match[1]] = match[2];
      }

      line = '';
    } else {
      line += String.fromCharCode(byte);
    }
  }

  return { offset, header };
}

/**
 * Parse resolution string: "-Y height +X width"
 */
function parseResolution(
  data: Uint8Array,
  offset: number
): { offset: number; width: number; height: number } {
  let line = '';

  // Read resolution line
  while (offset < data.length && data[offset] !== 0x0a) {
    line += String.fromCharCode(data[offset++]);
  }
  offset++; // Skip newline

  // Parse "-Y height +X width"
  const match = line.match(/^-Y\s+(\d+)\s+\+X\s+(\d+)$/);
  if (!match) {
    throw new DecodeError(`Invalid resolution string: ${line}`);
  }

  const height = parseInt(match[1], 10);
  const width = parseInt(match[2], 10);

  return { offset, width, height };
}

/**
 * Read a single scanline (may be RLE compressed)
 *
 * Radiance HDR uses run-length encoding for scanlines.
 * Format detection:
 * - New RLE: starts with [0x02, 0x02, width_hi, width_lo]
 * - Old/uncompressed: raw RGBE bytes
 */
function readScanline(
  data: Uint8Array,
  offset: number,
  width: number,
  scanline: Uint8Array
): number {
  // Check for new RLE format
  if (
    data[offset] === 0x02 &&
    data[offset + 1] === 0x02 &&
    data[offset + 2] === ((width >> 8) & 0xff) &&
    data[offset + 3] === (width & 0xff)
  ) {
    // New RLE format
    offset += 4;

    // Each channel is RLE-encoded separately
    for (let channel = 0; channel < 4; channel++) {
      let x = 0;
      while (x < width) {
        const code = data[offset++];

        if (code > 128) {
          // Run of same value
          const count = code - 128;
          const value = data[offset++];
          for (let i = 0; i < count; i++) {
            scanline[x * 4 + channel] = value;
            x++;
          }
        } else {
          // Non-repeated values
          const count = code;
          for (let i = 0; i < count; i++) {
            scanline[x * 4 + channel] = data[offset++];
            x++;
          }
        }
      }
    }
  } else {
    // Old format / uncompressed: just copy RGBE bytes
    for (let x = 0; x < width; x++) {
      scanline[x * 4] = data[offset++];
      scanline[x * 4 + 1] = data[offset++];
      scanline[x * 4 + 2] = data[offset++];
      scanline[x * 4 + 3] = data[offset++];
    }
  }

  return offset;
}

/**
 * Decodes OpenEXR file format
 *
 * TODO: Implement using tinyexr WASM
 *
 * For now, throws an error to indicate unsupported format.
 */
export async function decodeOpenEXR(
  arrayBuffer: ArrayBuffer
): Promise<LinearImage> {
  // Check EXR magic number: 0x76 0x2f 0x31 0x01
  const data = new Uint8Array(arrayBuffer);
  if (
    data.length < 4 ||
    data[0] !== 0x76 ||
    data[1] !== 0x2f ||
    data[2] !== 0x31 ||
    data[3] !== 0x01
  ) {
    throw new DecodeError('Invalid OpenEXR file: incorrect magic number');
  }

  throw new DecodeError(
    'OpenEXR decoding not yet implemented. Use Radiance HDR (.hdr) for now.'
  );
}

/**
 * Auto-detect format and decode
 */
export async function decodeHDRImage(
  arrayBuffer: ArrayBuffer,
  filename: string
): Promise<LinearImage> {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'hdr' || ext === 'pic') {
    return decodeRadianceHDR(arrayBuffer);
  } else if (ext === 'exr') {
    return decodeOpenEXR(arrayBuffer);
  }

  throw new DecodeError(`Unsupported file format: ${ext}`);
}
