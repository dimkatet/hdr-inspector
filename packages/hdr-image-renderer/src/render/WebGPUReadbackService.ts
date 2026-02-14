/**
 * WebGPU Implementation of PixelReadbackService
 *
 * Delegates to WebGPURenderer for pixel readback.
 */

import type { PixelReadback, RenderState } from '../types';
import type { PixelReadbackService } from './PixelReadbackService';
import type { Renderer } from './Renderer';

export class WebGPUReadbackService implements PixelReadbackService {
  constructor(private renderer: Renderer) {}

  async readPixels(options: RenderState): Promise<PixelReadback> {
    // For export, we render the full image without viewport transformations
    // Create a default viewport that shows the entire image at 1:1 scale (no zoom/pan)
    return this.renderer.readPixels({
      ...options,
      viewport: {
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    });
  }
}
