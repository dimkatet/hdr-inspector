/**
 * Renderer - Interface for image rendering backends
 *
 * Abstracts the rendering pipeline from specific GPU implementations.
 * Enables Dependency Inversion for CanvasCore, UploadService, and ReadbackService.
 *
 * Current implementation: WebGPURenderer
 */

import type { ImageData, PixelReadback, RenderState, ViewportState } from '../types';

/**
 * Combined render options: render state + viewport transform
 */
export type RenderOptions = RenderState & {
  /** Current viewport state (zoom and pan) */
  viewport: ViewportState;
};

/**
 * Interface for HDR image rendering backends
 *
 * Implementations handle GPU context management, texture upload,
 * shader pipeline, and pixel readback.
 */
export interface Renderer {
  /** Initialize rendering context and resources */
  initialize(): Promise<void>;

  /** Render current image with given options */
  render(options: RenderOptions): void;

  /** Upload image data to GPU texture */
  uploadImage(image: ImageData): Promise<void>;

  /** Get dimensions of the currently loaded image */
  getImageDimensions(): { width: number; height: number };

  /**
   * Read pixels from rendered output (GPU → CPU)
   * Used for image export functionality.
   */
  readPixels(options: RenderOptions): Promise<PixelReadback>;

  /** Cleanup rendering resources */
  dispose(): void;
}
