/**
 * HDR Capabilities Detection
 *
 * Detects browser and display HDR support for both video and canvas.
 */

export interface HDRCapabilities {
  displayHDR: boolean;        // Monitor supports HDR (dynamic-range: high)
  videoHDR: boolean;          // Browser can play HDR video (e.g., Netflix)
  canvasHDR: boolean;         // Browser supports HDR canvas (WebGPU)
  webgpuSupported: boolean;   // WebGPU API available
  colorGamut: 'srgb' | 'p3' | 'rec2020';  // Widest supported color gamut
  colorDepth: number;         // Bits per channel (8, 10, etc.)
  pixelRatio: number;         // Device pixel ratio
}

/**
 * Detect HDR capabilities of the browser and display
 */
export async function detectHDRCapabilities(): Promise<HDRCapabilities> {
  // 1. Check if display supports HDR via media query
  const displayHDR = window.matchMedia('(dynamic-range: high)').matches;

  // 2. Detect widest supported color gamut
  let colorGamut: 'srgb' | 'p3' | 'rec2020' = 'srgb';
  if (window.matchMedia('(color-gamut: rec2020)').matches) {
    colorGamut = 'rec2020';
  } else if (window.matchMedia('(color-gamut: p3)').matches) {
    colorGamut = 'p3';
  }

  // 3. Check video HDR support (VP9 Profile 2 for HDR10)
  // VP9 Profile 2 with 10-bit color is used for HDR video (YouTube, Netflix)
  const video = document.createElement('video');
  const videoHDR = video.canPlayType('video/webm; codecs="vp09.02.10.10"') !== '';

  // 4. Check WebGPU support
  const webgpuSupported = 'gpu' in navigator;

  // 5. Check Canvas HDR support via WebGPU
  let canvasHDR = false;
  if (webgpuSupported && displayHDR) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        // WebGPU + HDR display = likely HDR canvas support
        canvasHDR = true;
      }
    } catch (e) {
      canvasHDR = false;
    }
  }

  // 6. Get color depth (bits per channel)
  const colorDepth = screen.colorDepth || 24;

  // 7. Get pixel ratio
  const pixelRatio = window.devicePixelRatio || 1;

  return {
    displayHDR,
    videoHDR,
    canvasHDR,
    webgpuSupported,
    colorGamut,
    colorDepth,
    pixelRatio
  };
}

/**
 * Get human-readable description of capabilities
 */
export function getCapabilitiesDescription(caps: HDRCapabilities): string[] {
  const desc: string[] = [];

  desc.push(`WebGPU: ${caps.webgpuSupported ? '✅ Supported' : '❌ Not supported'}`);
  desc.push(`Display HDR: ${caps.displayHDR ? '✅ Supported' : '❌ Not detected'}`);
  desc.push(`Video HDR: ${caps.videoHDR ? '✅ Supported' : '❌ Not supported'}`);
  desc.push(`Canvas HDR: ${caps.canvasHDR ? '✅ Supported' : '❌ Not supported'}`);
  desc.push(`Color Gamut: ${caps.colorGamut.toUpperCase()}`);
  desc.push(`Color Depth: ${caps.colorDepth}-bit`);
  desc.push(`Pixel Ratio: ${caps.pixelRatio}x`);

  return desc;
}
