/**
 * @dimkatet/hdr-decoders
 *
 * Web-optimized HDR image decoders with unified API
 *
 * This package provides wrappers around established open-source decoders:
 * - AVIF: @jsquash/avif (jSquash project)
 * - JPEG XL: @jsquash/jxl (jSquash project)
 * - JPEG Ultra HDR: @monogrid/gainmap-js (MONOGRID)
 * - PNG (cICP): pngjs + custom cICP parser
 *
 * @example
 * ```typescript
 * // Import only the decoder you need (tree-shakeable)
 * import { decode as decodeAVIF } from '@dimkatet/hdr-decoders/avif'
 * import { decode as decodeJXL } from '@dimkatet/hdr-decoders/jxl'
 *
 * // Or use auto-detection
 * import { decodeAuto } from '@dimkatet/hdr-decoders'
 *
 * const buffer = await fetch('image.avif').then(r => r.arrayBuffer())
 * const result = await decodeAuto(buffer)
 *
 * // Use with HDRCanvas
 * canvas.loadImage(result.data)
 * ```
 */

import type { EncodedImageData, LinearImageData } from '@dimkatet/hdr-image-renderer'
import { decode as decodeAVIF, isAVIF } from './avif'
import { decode as decodeHDR, isHDR } from './radiance'
// import { decode as decodeJXL, isJXL } from './jxl'
// import { decode as decodeGainmap, isUltraHDR } from './gainmap'
// import { decode as decodePNG, isPNG } from './png'
import { DecodeError } from './types'
import type { DecodeResult } from './types'

/**
 * Auto-detect format and decode image
 *
 * @param buffer - ArrayBuffer containing image file data
 * @param options - Decoding options
 * @returns Promise resolving to decoded image data
 * @throws {DecodeError} If format is unsupported or decoding fails
 *
 * @example
 * ```typescript
 * const buffer = await fetch('image.avif').then(r => r.arrayBuffer())
 * const result = await decodeAuto(buffer)
 * console.log(result.width, result.height, result.bitDepth)
 * ```
 */
export async function decodeAuto(
  buffer: ArrayBuffer
): Promise<DecodeResult<EncodedImageData | LinearImageData>> {
  // Check format in order of likelihood for web
  // if (isPNG(buffer)) {
  //   return decodePNG(buffer, options)
  // }

  if (isAVIF(buffer)) {
    return decodeAVIF(buffer)
  }

  if (isHDR(buffer)) {
    return decodeHDR(buffer)
  }

  // if (isJXL(buffer)) {
  //   return decodeJXL(buffer, options)
  // }

  // if (isUltraHDR(buffer)) {
  //   return decodeGainmap(buffer, options)
  // }

  throw new DecodeError('Unsupported image format', 'unknown')
}

/**
 * Detect image format from buffer
 *
 * @param buffer - ArrayBuffer to check
 * @returns Format name or 'unknown'
 */
export function detectFormat(buffer: ArrayBuffer): 'avif' | 'jxl' | 'gainmap' | 'png' | 'hdr' | 'unknown' {
  // if (isPNG(buffer)) return 'png'
  if (isAVIF(buffer)) return 'avif'
  if (isHDR(buffer)) return 'hdr'
  // if (isJXL(buffer)) return 'jxl'
  // if (isUltraHDR(buffer)) return 'gainmap'
  return 'unknown'
}

// Re-export everything from modules
export { DecodeError } from './types'
export type { DecodeResult } from './types'

// Re-export format checkers
export { isAVIF } from './avif'
export { isHDR } from './radiance'
// export { isUltraHDR } from './gainmap'
// export { isPNG } from './png'
