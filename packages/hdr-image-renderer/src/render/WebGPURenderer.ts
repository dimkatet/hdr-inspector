/**
 * WebGPU HDR Renderer
 *
 * Renders linear HDR images with explicit exposure and tone mapping.
 * Supports native HDR output via PQ encoding when available.
 *
 * Architecture:
 * - GPUContextManager: Manages WebGPU context and HDR support
 * - TextureManager: Handles texture upload and preprocessing
 * - RenderPipelineManager: Manages render pipeline, shaders, bind groups
 * - ShaderConstants: Utility functions for shader constant indices
 */

import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import type { ColorSpace, ImageData } from '../types';
import { GPUContextManager } from './GPUContextManager';
import type { Renderer, RenderOptions } from './Renderer';
import { RenderPipelineManager } from './RenderPipelineManager';
import {
  getColorSpaceIndex,
  getObjectFitIndex,
  getToneMappingIndex,
  getTransferFunctionIndex,
  getVisualizationModeIndex,
} from './ShaderConstants';
import { TextureManager } from './TextureManager';

export interface WebGPURendererOptions {
  transparent?: boolean;
  logger?: Logger;
}

export class WebGPURenderer implements Renderer {
  private canvas: HTMLCanvasElement;
  private transparent = false;
  private logger: Logger;

  // Service modules
  private contextManager: GPUContextManager;
  private textureManager: TextureManager | null = null;
  private pipelineManager: RenderPipelineManager | null = null;

  constructor(canvas: HTMLCanvasElement, options: WebGPURendererOptions = {}) {
    this.canvas = canvas;
    this.transparent = options.transparent ?? false;
    this.logger = options.logger ?? silentLogger;

    // Initialize context manager
    this.contextManager = new GPUContextManager(
      canvas,
      { transparent: this.transparent },
      this.logger
    );
  }

  /**
   * Initialize WebGPU context and resources
   */
  async initialize(): Promise<void> {
    // Initialize GPU context
    await this.contextManager.initialize();

    const device = this.contextManager.getDevice();

    // Initialize texture manager
    this.textureManager = new TextureManager(device, this.logger);
    await this.textureManager.initialize();

    // Initialize pipeline manager
    this.pipelineManager = new RenderPipelineManager(device, this.logger);
    this.pipelineManager.initialize();

    this.logger.log('[WebGPURenderer] Initialized successfully');
  }

  /**
   * Upload image to GPU texture.
   * Delegates preprocessing (RGB→RGBA, bit depth remapping) to TextureManager.
   */
  async uploadImage(image: ImageData): Promise<void> {
    if (!this.textureManager || !this.pipelineManager) {
      throw new Error('Renderer not initialized');
    }

    // Upload texture
    await this.textureManager.uploadImage(image);

    // Create/recreate pipeline for this texture
    const textureInfo = this.textureManager.getTextureInfo();
    this.pipelineManager.createPipeline(
      {
        canvasFormat: this.contextManager.getCanvasFormat(),
        textureFormat: textureInfo.format,
      },
      this.textureManager.getTexture()
    );
  }

  /**
   * Render with current settings
   */
  render(options: RenderOptions): void {
    if (!this.textureManager || !this.pipelineManager) {
      this.logger.warn('[WebGPURenderer] Skipping render - not initialized');
      return;
    }

    // Skip render if pipeline not ready (no image loaded yet)
    if (!this.pipelineManager.isReady() || !this.textureManager.isReady()) {
      this.logger.warn('[WebGPURenderer] Skipping render - pipeline not ready');
      return;
    }

    // Reconfigure canvas if HDR mode or color space changed
    this.contextManager.reconfigure({
      hdrMode: options.hdrMode,
      colorSpace: options.colorSpace,
    });

    // Update uniforms
    const { width: imageWidth, height: imageHeight } = this.textureManager.getImageDimensions();
    const imageAspect = imageWidth / imageHeight;
    const canvasAspect = this.canvas.width / this.canvas.height;
    const textureInfo = this.textureManager.getTextureInfo();

    const uniforms = new Float32Array([
      options.exposure,
      getToneMappingIndex(options.toneMapping),
      getVisualizationModeIndex(options.visualizationMode),
      options.hdrMode ? 1.0 : 0.0,
      getColorSpaceIndex(options.colorSpace),
      options.viewport.zoom,
      options.viewport.panX,
      options.viewport.panY,
      imageAspect,
      canvasAspect,
      this.transparent ? 1.0 : 0.0,
      getTransferFunctionIndex(textureInfo.transferFunction),
      getObjectFitIndex(options.objectFit),
      imageWidth / this.canvas.width, // pixelScaleX: fraction of canvas the image occupies at 1:1
      imageHeight / this.canvas.height, // pixelScaleY: fraction of canvas the image occupies at 1:1
      0.0, // padding for 16-byte alignment
    ]);

    const device = this.contextManager.getDevice();
    device.queue.writeBuffer(this.pipelineManager.getUniformBuffer(), 0, uniforms.buffer);

    // Create command encoder
    const commandEncoder = device.createCommandEncoder();

    // Get current texture view
    const context = this.contextManager.getContext();
    const textureView = context.getCurrentTexture().createView();

    // Create render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: 'clear',
          clearValue: {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: this.transparent ? 0.0 : 1.0,
          },
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.pipelineManager.getPipeline());
    renderPass.setBindGroup(0, this.pipelineManager.getBindGroup());
    renderPass.draw(4); // Fullscreen quad (triangle strip)
    renderPass.end();

    // Submit commands
    device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Get loaded image dimensions
   */
  getImageDimensions(): { width: number; height: number } {
    if (!this.textureManager) {
      return { width: 1, height: 1 };
    }
    return this.textureManager.getImageDimensions();
  }

  /**
   * Read pixels from rendered canvas (GPU → CPU)
   *
   * Renders full image with current settings but ignores viewport (zoom/pan).
   * Useful for image export functionality.
   *
   * @param options - Render options (exposure, tone mapping, etc.)
   * @returns Pixel data + metadata
   */
  async readPixels(options: RenderOptions): Promise<{
    pixels: Uint8Array | Uint16Array | Float32Array;
    width: number;
    height: number;
    format: GPUTextureFormat;
    colorSpace: ColorSpace;
  }> {
    if (!this.textureManager || !this.pipelineManager) {
      throw new Error('Renderer not initialized');
    }

    if (!this.pipelineManager.isReady() || !this.textureManager.isReady()) {
      throw new Error('Cannot read pixels: renderer not ready (no image loaded)');
    }

    const device = this.contextManager.getDevice();
    const format = this.contextManager.getCanvasFormat();
    const { width: imageWidth, height: imageHeight } = this.textureManager.getImageDimensions();
    const textureInfo = this.textureManager.getTextureInfo();
    const bytesPerPixel = format === 'rgba16float' ? 8 : 4;

    // Calculate aligned bytes per row (must be multiple of 256 for WebGPU)
    const bytesPerRow = Math.ceil((imageWidth * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * imageHeight;

    // Create offscreen render target with same format as canvas
    const renderTexture = device.createTexture({
      size: { width: imageWidth, height: imageHeight },
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    // Create staging buffer for readback
    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Create temporary uniform buffer for offscreen render
    // (don't touch this.uniformBuffer to avoid canvas flicker)
    const tempUniformBuffer = device.createBuffer({
      size: 64, // Same as main uniformBuffer
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create temporary bind group with offscreen uniforms
    const tempBindGroup = device.createBindGroup({
      layout: this.pipelineManager.getPipeline().getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: this.textureManager.getTexture().createView(),
        },
        {
          binding: 1,
          resource: this.pipelineManager.getSampler(),
        },
        {
          binding: 2,
          resource: { buffer: tempUniformBuffer },
        },
      ],
    });

    try {
      // Prepare uniforms for full-image render (zoom=1, no pan)
      const imageAspect = imageWidth / imageHeight;
      const canvasAspect = imageWidth / imageHeight; // 1:1 for offscreen

      const uniforms = new Float32Array([
        options.exposure,
        getToneMappingIndex(options.toneMapping),
        getVisualizationModeIndex(options.visualizationMode),
        options.hdrMode ? 1.0 : 0.0,
        getColorSpaceIndex(options.colorSpace),
        options.viewport.zoom,
        options.viewport.panX,
        options.viewport.panY,
        imageAspect,
        canvasAspect,
        this.transparent ? 1.0 : 0.0,
        getTransferFunctionIndex(textureInfo.transferFunction),
        getObjectFitIndex(options.objectFit),
        1.0, // pixelScaleX: 1:1 pixel mapping
        1.0, // pixelScaleY: 1:1 pixel mapping
        0.0, // padding
      ]);
      device.queue.writeBuffer(tempUniformBuffer, 0, uniforms.buffer);

      // Create command encoder
      const commandEncoder = device.createCommandEncoder();

      // Render to offscreen texture
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: renderTexture.createView(),
            loadOp: 'clear',
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: this.transparent ? 0.0 : 1.0 },
            storeOp: 'store',
          },
        ],
      });

      renderPass.setPipeline(this.pipelineManager.getPipeline());
      renderPass.setBindGroup(0, tempBindGroup); // Use temporary bind group
      renderPass.draw(4); // Fullscreen quad
      renderPass.end();

      // Copy texture to staging buffer
      commandEncoder.copyTextureToBuffer(
        { texture: renderTexture },
        { buffer: stagingBuffer, bytesPerRow },
        { width: imageWidth, height: imageHeight }
      );

      // Submit commands
      device.queue.submit([commandEncoder.finish()]);

      // Wait for GPU operations to complete and map buffer
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const mappedRange = stagingBuffer.getMappedRange();

      // Extract pixel data based on format
      const processor = this.textureManager.getProcessor();
      let pixels: Uint8Array | Uint16Array | Float32Array;
      if (format === 'rgba16float') {
        // For HDR, read as Uint16Array (raw bits)
        const rawData = new Uint16Array(mappedRange.slice(0));
        pixels = processor.unpadRows(rawData, imageWidth, imageHeight, bytesPerRow, 2);
      } else {
        // For SDR, read as Uint8Array
        const rawData = new Uint8Array(mappedRange.slice(0));
        const unpaddedPixels = processor.unpadRows(
          rawData,
          imageWidth,
          imageHeight,
          bytesPerRow,
          1
        );

        // Convert BGRA to RGBA if needed (bgra8unorm is common preferred format)
        if (format === 'bgra8unorm' && unpaddedPixels instanceof Uint8Array) {
          pixels = processor.bgraToRgba(unpaddedPixels);
        } else {
          pixels = unpaddedPixels;
        }
      }

      stagingBuffer.unmap();

      return {
        pixels,
        width: imageWidth,
        height: imageHeight,
        format,
        colorSpace: options.colorSpace,
      };
    } finally {
      // Cleanup all temporary resources
      tempUniformBuffer.destroy();
      renderTexture.destroy();
      stagingBuffer.destroy();
    }
  }

  /**
   * Cleanup resources
   * Note: Does NOT destroy the shared GPUDevice - only local resources
   */
  destroy(): void {
    this.logger.log('[WebGPURenderer] Destroying renderer');

    if (this.textureManager) {
      this.textureManager.destroy();
    }
    if (this.pipelineManager) {
      this.pipelineManager.destroy();
    }
  }
}
