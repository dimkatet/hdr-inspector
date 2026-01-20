/**
 * Radiance HDR Decoder
 *
 * Decodes Radiance HDR (.hdr, .pic) files into linear RGB Float32Array.
 * All output is scene-referred, linear, with no transfer function applied.
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

import type { LinearImageData } from '@dimkatet/hdr-image-renderer';

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
 */
export function decodeRadianceHDR(arrayBuffer: ArrayBuffer): LinearImageData {
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
        const scale = 2 ** (e - 128) / 256;
        rgbData[rgbOffset] = r * scale;
        rgbData[rgbOffset + 1] = g * scale;
        rgbData[rgbOffset + 2] = b * scale;
      }
    }
  }

  return {
    width,
    height,
    data: rgbData,
    channels,
    transferFunction: 'linear' as const,
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
  initialOffset: number
): { offset: number; width: number; height: number } {
  let line = '';
  let pos = initialOffset;

  // Read resolution line
  while (pos < data.length && data[pos] !== 0x0a) {
    line += String.fromCharCode(data[pos++]);
  }
  pos++; // Skip newline

  // Parse "-Y height +X width"
  const match = line.match(/^-Y\s+(\d+)\s+\+X\s+(\d+)$/);
  if (!match) {
    throw new DecodeError(`Invalid resolution string: ${line}`);
  }

  const height = Number.parseInt(match[1], 10);
  const width = Number.parseInt(match[2], 10);

  return { offset: pos, width, height };
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
  initialOffset: number,
  width: number,
  scanline: Uint8Array
): number {
  let pos = initialOffset;

  // Check for new RLE format
  if (
    data[pos] === 0x02 &&
    data[pos + 1] === 0x02 &&
    data[pos + 2] === ((width >> 8) & 0xff) &&
    data[pos + 3] === (width & 0xff)
  ) {
    // New RLE format
    pos += 4;

    // Each channel is RLE-encoded separately
    for (let channel = 0; channel < 4; channel++) {
      let x = 0;
      while (x < width) {
        const code = data[pos++];

        if (code > 128) {
          // Run of same value
          const count = code - 128;
          const value = data[pos++];
          for (let i = 0; i < count; i++) {
            scanline[x * 4 + channel] = value;
            x++;
          }
        } else {
          // Non-repeated values
          const count = code;
          for (let i = 0; i < count; i++) {
            scanline[x * 4 + channel] = data[pos++];
            x++;
          }
        }
      }
    }
  } else {
    // Old format / uncompressed: just copy RGBE bytes
    for (let x = 0; x < width; x++) {
      scanline[x * 4] = data[pos++];
      scanline[x * 4 + 1] = data[pos++];
      scanline[x * 4 + 2] = data[pos++];
      scanline[x * 4 + 3] = data[pos++];
    }
  }

  return pos;
}
