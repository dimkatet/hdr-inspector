/**
 * PixelReadbackService Interface
 *
 * Abstracts pixel readback operations from specific renderer implementation.
 * Enables Dependency Inversion for ExportManager.
 */

import type { PixelReadback, RenderState } from '../types';

export interface PixelReadbackService {
  /**
   * Read all pixels from rendered texture
   * Returns raw pixel data with applied render settings
   * @param options - Render options (exposure, tone mapping, etc.)
   */
  readPixels(options: RenderState): Promise<PixelReadback>;
}
