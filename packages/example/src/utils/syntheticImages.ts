/**
 * Synthetic Image Generators
 *
 * Generate test patterns for different ImageData formats
 */

import type { EncodedImageData, LinearImageData } from '@dimkatet/hdr-canvas';

/**
 * Generate horizontal gradient (Linear Float32, HDR)
 * Left: black (0), Right: bright white (10.0 for HDR testing)
 */
export function generateLinearGradient(width = 1920, height = 1080): LinearImageData {
  const data = new Float32Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const t = x / (width - 1); // 0 to 1

      // Gradient from black to super-bright (HDR range)
      const value = t * 10.0; // 0 to 10 (way above SDR range!)

      data[idx] = value; // R
      data[idx + 1] = value; // G
      data[idx + 2] = value; // B
    }
  }

  return {
    width,
    height,
    data,
    channels: 3,
    transferFunction: 'linear',
  };
}

/**
 * Generate RGB gradient (Encoded Uint8, sRGB)
 * Top-left: red, Top-right: green, Bottom: blue
 */
export function generateRGBGradient(width = 1920, height = 1080): EncodedImageData {
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const tx = x / (width - 1); // 0 to 1 (left to right)
      const ty = y / (height - 1); // 0 to 1 (top to bottom)

      // Red: decreases left to right
      data[idx] = Math.floor((1 - tx) * 255);
      // Green: increases left to right
      data[idx + 1] = Math.floor(tx * 255);
      // Blue: increases top to bottom
      data[idx + 2] = Math.floor(ty * 255);
      // Alpha: full opacity
      data[idx + 3] = 255;
    }
  }

  return {
    width,
    height,
    data,
    channels: 4,
    transferFunction: 'srgb',
  };
}

/**
 * Generate radial gradient (Linear Float32, HDR)
 * Center: super-bright (20.0), Edges: black
 */
export function generateRadialHDR(width = 1920, height = 1080): LinearImageData {
  const data = new Float32Array(width * height * 3);
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = 1 - dist / maxDist; // 1 at center, 0 at edges

      // Exponential falloff for HDR effect
      const value = t ** 0.5 * 20.0; // 0 to 20 (extreme HDR!)

      data[idx] = value; // R
      data[idx + 1] = value; // G
      data[idx + 2] = value; // B
    }
  }

  return {
    width,
    height,
    data,
    channels: 3,
    transferFunction: 'linear',
  };
}

/**
 * Generate checkerboard pattern (Encoded Uint8, sRGB)
 * Black and white squares
 */
export function generateCheckerboard(
  width = 1920,
  height = 1080,
  squareSize = 64
): EncodedImageData {
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const squareX = Math.floor(x / squareSize);
      const squareY = Math.floor(y / squareSize);
      const isWhite = (squareX + squareY) % 2 === 0;
      const value = isWhite ? 255 : 0;

      data[idx] = value; // R
      data[idx + 1] = value; // G
      data[idx + 2] = value; // B
      data[idx + 3] = 255; // A
    }
  }

  return {
    width,
    height,
    data,
    channels: 4,
    transferFunction: 'srgb',
  };
}

/**
 * Generate color spectrum (Encoded Uint16, sRGB)
 * Full hue spectrum left to right, brightness top to bottom
 */
export function generateSpectrum16(width = 1920, height = 1080): EncodedImageData {
  const data = new Uint16Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const hue = (x / (width - 1)) * 360; // 0 to 360 degrees
      const value = 1 - y / (height - 1); // 1 at top, 0 at bottom

      // HSV to RGB
      const c = value; // chroma
      const h = hue / 60;
      const x_val = c * (1 - Math.abs((h % 2) - 1));
      const m = 0;

      let r = 0;
      let g = 0;
      let b = 0;
      if (h < 1) {
        r = c;
        g = x_val;
        b = 0;
      } else if (h < 2) {
        r = x_val;
        g = c;
        b = 0;
      } else if (h < 3) {
        r = 0;
        g = c;
        b = x_val;
      } else if (h < 4) {
        r = 0;
        g = x_val;
        b = c;
      } else if (h < 5) {
        r = x_val;
        g = 0;
        b = c;
      } else {
        r = c;
        g = 0;
        b = x_val;
      }

      data[idx] = Math.floor((r + m) * 65535);
      data[idx + 1] = Math.floor((g + m) * 65535);
      data[idx + 2] = Math.floor((b + m) * 65535);
      data[idx + 3] = 65535;
    }
  }

  return {
    width,
    height,
    data,
    channels: 4,
    transferFunction: 'srgb',
  };
}

/**
 * Generate HDR gradient with PQ encoding (Uint16, PQ transfer function)
 * Simulates HDR10 content: left = 0 nits, right = 1000 nits
 */
export function generatePQGradient(width = 1920, height = 1080): EncodedImageData {
  const data = new Uint16Array(width * height * 4);

  // PQ constants (SMPTE ST 2084)
  const m1 = 0.1593017578125; // 2610 / 16384
  const m2 = 78.84375; // 2523 / 32 * 128
  const c1 = 0.8359375; // 3424 / 4096
  const c2 = 18.8515625; // 2413 / 128 * 32
  const c3 = 18.6875; // 2392 / 128 * 32

  // PQ OETF (linear → PQ encoded)
  const linearToPQ = (linear: number): number => {
    // Normalize to [0, 1] range representing [0, 10000] nits
    const Y = Math.max(0, Math.min(1, linear / 10000));
    const Ym1 = Y ** m1;
    const N = (c1 + c2 * Ym1) / (1 + c3 * Ym1);
    return N ** m2;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const t = x / (width - 1); // 0 to 1 (left to right)

      // Gradient from 0 nits (black) to 1000 nits (bright)
      const nits = t * 1000;

      // Apply PQ OETF to convert linear nits to PQ-encoded value
      const pqValue = linearToPQ(nits);

      // Convert to uint16 (0-65535 range)
      const encoded = Math.floor(pqValue * 65535);

      data[idx] = encoded; // R
      data[idx + 1] = encoded; // G
      data[idx + 2] = encoded; // B
      data[idx + 3] = 65535; // A
    }
  }

  return {
    width,
    height,
    data,
    channels: 4,
    transferFunction: 'pq',
  };
}

/**
 * Generate HDR sunset with PQ encoding (Uint16)
 * Simulates HDR scene: sky = 500 nits, sun = 4000 nits
 */
export function generatePQSunset(width = 1920, height = 1080): EncodedImageData {
  const data = new Uint16Array(width * height * 4);

  // PQ constants
  const m1 = 0.1593017578125;
  const m2 = 78.84375;
  const c1 = 0.8359375;
  const c2 = 18.8515625;
  const c3 = 18.6875;

  const linearToPQ = (linear: number): number => {
    const Y = Math.max(0, Math.min(1, linear / 10000));
    const Ym1 = Y ** m1;
    const N = (c1 + c2 * Ym1) / (1 + c3 * Ym1);
    return N ** m2;
  };

  const centerX = width / 2;
  const centerY = height / 3;
  const sunRadius = Math.min(width, height) / 10;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Distance from sun center
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Sky gradient (top to bottom)
      const skyGradient = 1 - y / height; // 1 at top, 0 at bottom
      const skyNits = 50 + skyGradient * 450; // 50-500 nits

      // Sun with smooth falloff
      const sunFactor = Math.max(0, 1 - dist / sunRadius);
      const sunNits = sunFactor ** 2 * 4000; // 0-4000 nits

      // Combine sky + sun
      const totalNits = skyNits + sunNits;

      // Sunset colors
      const ty = y / height;
      const r = totalNits;
      const g = totalNits * (0.6 + ty * 0.2); // Less green
      const b = totalNits * (0.3 + ty * 0.3); // Even less blue

      // Apply PQ encoding
      const rPQ = linearToPQ(r);
      const gPQ = linearToPQ(g);
      const bPQ = linearToPQ(b);

      data[idx] = Math.floor(rPQ * 65535);
      data[idx + 1] = Math.floor(gPQ * 65535);
      data[idx + 2] = Math.floor(bPQ * 65535);
      data[idx + 3] = 65535;
    }
  }

  return {
    width,
    height,
    data,
    channels: 4,
    transferFunction: 'pq',
  };
}

/**
 * Generate test card with all formats
 */
export const syntheticImages = {
  linearGradient: generateLinearGradient,
  rgbGradient: generateRGBGradient,
  radialHDR: generateRadialHDR,
  checkerboard: generateCheckerboard,
  spectrum16: generateSpectrum16,
  pqGradient: generatePQGradient,
  pqSunset: generatePQSunset,
} as const;
