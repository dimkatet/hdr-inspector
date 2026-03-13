/**
 * Texture Manager
 *
 * Manages GPU texture creation, uploading, and lifecycle.
 * Delegates preprocessing (RGB→RGBA, bit depth remapping) to ImageProcessor.
 */

import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import type { ColorPrimaries, ImageData, LinearImageData, TransferFunction } from '../types';
import { GPUImagePreprocessor } from './GPUImagePreprocessor';
import type { ImagePreprocessor } from './ImagePreprocessor';

export interface TextureInfo {
  width: number;
  height: number;
  format: GPUTextureFormat;
  transferFunction: TransferFunction;
  colorPrimaries?: ColorPrimaries;
}

export class TextureManager {
  private texture: GPUTexture | null = null;
  private imageWidth = 1;
  private imageHeight = 1;
  private currentTextureFormat: GPUTextureFormat = 'rgba32float';
  private currentTransferFunction: TransferFunction = 'linear';
  private currentColorPrimaries: ColorPrimaries | undefined = undefined;
  private preprocessor: ImagePreprocessor;

  constructor(
    private device: GPUDevice,
    private logger: Logger = silentLogger,
    preprocessor?: ImagePreprocessor
  ) {
    // Default to GPU implementation
    this.preprocessor = preprocessor ?? new GPUImagePreprocessor(this.logger);
  }

  /**
   * Initialize texture manager (must be called before upload)
   */
  async initialize(): Promise<void> {
    // Initialize image preprocessor (compute pipeline for RGB→RGBA, bit depth remapping)
    await this.preprocessor.initialize();
    this.logger.log('[TextureManager] Initialized successfully');
  }

  /**
   * Upload image to GPU texture.
   * Delegates preprocessing (RGB→RGBA, bit depth remapping) to ImageProcessor.
   *
   * Float32Array inputs are downcast to Float16Array before upload.
   * This enables bilinear filtering (rgba16float is filterable; rgba32float is not),
   * and halves GPU memory usage. Float16 precision is sufficient for display.
   */
  async uploadImage(image: ImageData): Promise<void> {
    // Downcast Float32 → Float16 to enable bilinear filtering on GPU.
    // rgba32float textures require non-filtering samplers (WebGPU limitation).
    // rgba16float is filterable and uses half the GPU memory.
    if (image.data instanceof Float32Array) {
      image = { ...(image as LinearImageData), data: new Float16Array(image.data) };
    }

    this.imageWidth = image.width;
    this.imageHeight = image.height;
    this.currentTransferFunction = image.transferFunction;
    this.currentColorPrimaries = image.colorPrimaries;

    // Destroy old texture if exists
    if (this.texture) {
      this.texture.destroy();
    }

    // Analyze image to determine texture format and preprocessing needs
    const analysis = this.preprocessor.analyze(image);
    this.currentTextureFormat = analysis.textureFormat;

    // Create texture
    this.texture = this.device.createTexture({
      size: { width: image.width, height: image.height },
      format: analysis.textureFormat,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    if (!analysis.needsPreprocessing) {
      // Fast path: already RGBA with correct bit depth — direct upload
      this.device.queue.writeTexture(
        { texture: this.texture },
        image.data.buffer,
        {
          offset: 0,
          bytesPerRow: image.width * 4 * analysis.bytesPerChannel,
          rowsPerImage: image.height,
        },
        { width: image.width, height: image.height }
      );
    } else {
      // GPU preprocessing: RGB→RGBA + bit depth remapping via compute shader
      const result = await this.preprocessor.preprocess(image, analysis);
      // Copy preprocessed buffer directly to texture (GPU-only, no CPU readback)
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToTexture(
        {
          buffer: result.buffer,
          bytesPerRow: result.bytesPerRow,
          rowsPerImage: result.height,
        },
        { texture: this.texture },
        { width: result.width, height: result.height }
      );
      this.device.queue.submit([encoder.finish()]);

      result.destroy();
    }

    this.logger.log('[TextureManager] Image uploaded successfully:', {
      width: image.width,
      height: image.height,
      format: analysis.textureFormat,
      transferFunction: image.transferFunction,
    });
  }

  /**
   * Get current texture
   */
  getTexture(): GPUTexture {
    if (!this.texture) {
      throw new Error('No texture loaded');
    }
    return this.texture;
  }

  /**
   * Get texture info
   */
  getTextureInfo(): TextureInfo {
    return {
      width: this.imageWidth,
      height: this.imageHeight,
      format: this.currentTextureFormat,
      transferFunction: this.currentTransferFunction,
      colorPrimaries: this.currentColorPrimaries,
    };
  }

  /**
   * Get loaded image dimensions
   */
  getImageDimensions(): { width: number; height: number } {
    return { width: this.imageWidth, height: this.imageHeight };
  }

  /**
   * Check if texture is ready
   */
  isReady(): boolean {
    return this.texture !== null;
  }

  /**
   * Get image processor (for pixel readback operations)
   */
  getProcessor(): ImagePreprocessor {
    return this.preprocessor;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.texture) {
      this.texture.destroy();
      this.texture = null;
    }
    this.preprocessor.destroy();
    this.logger.log('[TextureManager] Destroyed');
  }
}
