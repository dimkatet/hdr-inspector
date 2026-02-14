/**
 * ImageUploadService Interface
 *
 * Abstracts image upload operations from specific renderer implementation.
 * Enables Dependency Inversion for ImageLoadingManager.
 */

import type { ImageData, ImageInfo } from './types';

export interface ImageUploadService {
  /**
   * Upload image data to renderer
   */
  upload(data: ImageData): Promise<ImageInfo>;

  /**
   * Get currently loaded image info
   */
  getImageInfo(): ImageInfo;

  /**
   * Check if image is loaded
   */
  isReady(): boolean;
}
