/**
 * WebGPU Implementation of ImageUploadService
 *
 * Delegates to WebGPURenderer for actual upload.
 */

import type { ImageUploadService } from './ImageUploadService';
import type { Renderer } from './render/Renderer';
import type { ImageData, ImageInfo } from './types';

export class WebGPUUploadService implements ImageUploadService {
  constructor(private renderer: Renderer) {}

  async upload(data: ImageData): Promise<ImageInfo> {
    await this.renderer.uploadImage(data);
    const info = this.getImageInfo();
    return 'colorPrimaries' in data && data.colorPrimaries
      ? { ...info, colorPrimaries: data.colorPrimaries }
      : info;
  }

  getImageInfo(): ImageInfo {
    const dims = this.renderer.getImageDimensions();
    return {
      width: dims.width,
      height: dims.height,
      aspectRatio: dims.width / dims.height,
    };
  }

  isReady(): boolean {
    const dims = this.renderer.getImageDimensions();
    return dims.width > 1 && dims.height > 1;
  }
}
