/**
 * Image-derived render defaults
 *
 * Derives render setting hints from image metadata.
 * Called on image load to update autoState in RenderSettings.
 * User overrides (userState) are unaffected.
 */

import type { ColorPrimaries, ImageInfo } from '../domain/types/image';
import type { ColorSpace, RenderState } from '../domain/types/render';

/**
 * Maps source color primaries to the best-matching WebGPU canvas color space.
 *
 * Wide-gamut primaries (bt2020, dci-p3, aces, acescg, xyz) map to display-p3
 * as the broadest reliably-supported WebGPU canvas output color space.
 * bt709-family and SDTV primaries map to srgb.
 */
function toOutputColorSpace(primaries: ColorPrimaries): ColorSpace {
  switch (primaries) {
    case 'display-p3':
      return 'display-p3';
    case 'bt2020':
    case 'dci-p3':
    case 'aces':
    case 'acescg':
    case 'xyz':
      return 'display-p3'; // best available wide-gamut canvas output
    default:
      // bt709, bt470m, bt470bg, bt601, smpte240, generic-film, ebu3213
      return 'srgb';
  }
}

/**
 * Derive render state hints from image metadata.
 * Only derives fields for which the image provides meaningful signal.
 *
 * Result is applied to autoState via applyImageDefaults() — user overrides survive.
 */
export function deriveImageDefaults(info: ImageInfo): Partial<RenderState> {
  const derived: Partial<RenderState> = {};

  if (info.colorPrimaries) {
    derived.colorSpace = toOutputColorSpace(info.colorPrimaries);
  }

  return derived;
}
