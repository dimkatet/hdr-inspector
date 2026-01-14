/**
 * Color Science Utilities
 *
 * Core color transformations for HDR imaging.
 * All inputs are assumed to be linear, scene-referred RGB in BT.709 primaries.
 */

/**
 * BT.709 luminance weights (relative luminance)
 * Y = 0.2126*R + 0.7152*G + 0.0722*B
 *
 * These weights correspond to the CIE 1931 luminous efficiency function
 * projected onto BT.709/sRGB primaries.
 */
export const BT709_WEIGHTS = {
  r: 0.2126,
  g: 0.7152,
  b: 0.0722
} as const

/**
 * Compute luminance (Y) from linear RGB
 *
 * @param r - Red channel (linear, scene-referred)
 * @param g - Green channel (linear, scene-referred)
 * @param b - Blue channel (linear, scene-referred)
 * @returns Luminance in cd/m² (for scene-referred, unitless)
 */
export function luminance(r: number, g: number, b: number): number {
  return BT709_WEIGHTS.r * r + BT709_WEIGHTS.g * g + BT709_WEIGHTS.b * b
}

/**
 * Apply exposure adjustment in stops (EV)
 *
 * @param value - Linear color value (scene-referred)
 * @param ev - Exposure value in stops (e.g., +1 = double brightness, -1 = half)
 * @returns Exposure-adjusted value
 */
export function applyExposure(value: number, ev: number): number {
  return value * Math.pow(2, ev)
}

/**
 * Tone mapping operators
 * All operators work on linear, scene-referred RGB after exposure adjustment.
 */

/**
 * No tone mapping (explicit clamp)
 * Clamps values to [0, 1] for display.
 *
 * @param x - Linear color value
 * @returns Clamped value in [0, 1]
 */
export function toneMappingNone(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/**
 * Reinhard tone mapping
 * Simple, per-channel operator: x / (1 + x)
 *
 * Properties:
 * - Asymptotic to 1 as x → ∞
 * - Preserves hue (per-channel)
 * - No parameters
 *
 * @param x - Linear color value
 * @returns Tone-mapped value in [0, 1)
 */
export function toneMappingReinhard(x: number): number {
  return x / (1 + x)
}

/**
 * ACES Filmic tone mapping (fitted approximation)
 * Based on Narkowicz 2015 ACES fit
 *
 * Formula: (x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14)
 *
 * Properties:
 * - S-curve (shoulder and toe)
 * - Per-channel (not luminance-preserving)
 * - Approximates ACES RRT+ODT
 *
 * Reference: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
 *
 * @param x - Linear color value
 * @returns Tone-mapped value
 */
export function toneMappingACES(x: number): number {
  const a = 2.51
  const b = 0.03
  const c = 2.43
  const d = 0.59
  const e = 0.14

  return Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e))
}

/**
 * Apply tone mapping operator
 *
 * @param r - Red channel (linear, after exposure)
 * @param g - Green channel (linear, after exposure)
 * @param b - Blue channel (linear, after exposure)
 * @param operator - Tone mapping operator name
 * @returns Tone-mapped RGB in [0, 1]
 */
export function applyToneMapping(
  r: number,
  g: number,
  b: number,
  operator: 'none' | 'reinhard' | 'aces'
): [number, number, number] {
  let mapFn: (x: number) => number

  switch (operator) {
    case 'none':
      mapFn = toneMappingNone
      break
    case 'reinhard':
      mapFn = toneMappingReinhard
      break
    case 'aces':
      mapFn = toneMappingACES
      break
  }

  return [mapFn(r), mapFn(g), mapFn(b)]
}

/**
 * Linear to sRGB transfer function (gamma encoding)
 *
 * Converts linear RGB to sRGB for display.
 * This is NOT a color space transform—it's encoding for the display pipeline.
 *
 * Formula (per IEC 61966-2-1):
 * - if x <= 0.0031308: 12.92 * x
 * - else: 1.055 * x^(1/2.4) - 0.055
 *
 * @param linear - Linear color value in [0, 1]
 * @returns sRGB-encoded value in [0, 1]
 */
export function linearToSRGB(linear: number): number {
  if (linear <= 0.0031308) {
    return 12.92 * linear
  }
  return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
}

/**
 * sRGB to Linear transfer function (gamma decoding)
 *
 * Inverse of linearToSRGB.
 *
 * @param srgb - sRGB-encoded value in [0, 1]
 * @returns Linear color value in [0, 1]
 */
export function srgbToLinear(srgb: number): number {
  if (srgb <= 0.04045) {
    return srgb / 12.92
  }
  return Math.pow((srgb + 0.055) / 1.055, 2.4)
}
