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

import type { RuntimeContext, RuntimeService } from '../core/RuntimeService';
import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import type { ColorSpace, ImageData } from '../types';
import { GPUContextManager } from './GPUContextManager';
import type { Renderer, RenderOptions } from './Renderer';
import { RenderPipelineManager } from './RenderPipelineManager';
import {
  getInputColorSpaceIndex,
  getObjectFitIndex,
  getOutputTransferFunctionIndex,
  getToneMappingIndex,
  getTransferFunctionIndex,
  getVisualizationModeIndex,
} from './ShaderConstants';
import { TextureManager } from './TextureManager';

export interface WebGPURendererOptions {
  transparent?: boolean;
  logger?: Logger;
}

export class WebGPURenderer implements Renderer, RuntimeService {
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

  // ============================================================
  // RuntimeService implementation
  // ============================================================

  async init(_ctx: RuntimeContext): Promise<void> {
    return this.initialize();
  }

  start(): void {
    // no-op — renderer is passive, renders on demand
  }

  stop(): void {
    // no-op — renderer has no background activity
  }

  dispose(): void {
    this.cleanup();
  }

  // ============================================================
  // Renderer interface
  // ============================================================

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
      getInputColorSpaceIndex(textureInfo.colorPrimaries),
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
      1.0,                              // outputTransferFunction: sRGB EOTF⁻¹ (display)
      textureInfo.bitDepth,             // bitDepth for sub-16 normalization
      0.0, 0.0, 0.0,                    // _pad1, _pad2, _pad3
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
   * Always renders to rgba16float for maximum precision.
   * For linear float inputs, returns Float16Array (linear values).
   * For integer-encoded inputs (sRGB/PQ), scales to Uint16Array [0, 2^bitDepth - 1].
   *
   * @param options - Render options (exposure, tone mapping, etc.)
   * @returns Pixel data + metadata
   */
  async readPixels(options: RenderOptions): Promise<{
    pixels: Uint8Array | Uint16Array | Float16Array | Float32Array;
    width: number;
    height: number;
    format: GPUTextureFormat;
    colorSpace: ColorSpace;
    bitDepth: number;
  }> {
    if (!this.textureManager || !this.pipelineManager) {
      throw new Error('Renderer not initialized');
    }

    if (!this.pipelineManager.isReady() || !this.textureManager.isReady()) {
      throw new Error('Cannot read pixels: renderer not ready (no image loaded)');
    }

    const device = this.contextManager.getDevice();
    const { width: imageWidth, height: imageHeight } = this.textureManager.getImageDimensions();
    const textureInfo = this.textureManager.getTextureInfo();

    // Export always uses rgba16float for maximum precision
    const exportFormat: GPUTextureFormat = 'rgba16float';
    const bytesPerPixel = 8; // 4 channels × 2 bytes (float16)
    const bytesPerRow = Math.ceil((imageWidth * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * imageHeight;

    // Create offscreen rgba16float render target
    const renderTexture = device.createTexture({
      size: { width: imageWidth, height: imageHeight },
      format: exportFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const tempUniformBuffer = device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Get export pipeline (targets rgba16float, cached by input texture format)
    const exportPipeline = this.pipelineManager.createExportPipeline(textureInfo.format);

    const tempBindGroup = device.createBindGroup({
      layout: exportPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.textureManager.getTexture().createView() },
        { binding: 1, resource: this.pipelineManager.getSampler() },
        { binding: 2, resource: { buffer: tempUniformBuffer } },
      ],
    });

    try {
      const imageAspect = imageWidth / imageHeight;

      // outputTransferFunction: 0=linear (for float inputs), 1=sRGB, 2=PQ
      const outputTFIndex = getOutputTransferFunctionIndex(textureInfo.transferFunction);

      const uniforms = new Float32Array([
        options.exposure,
        getToneMappingIndex(options.toneMapping),
        getVisualizationModeIndex(options.visualizationMode),
        options.hdrMode ? 1.0 : 0.0,
        0.0, // inputColorSpace: no CST for export (preserve original gamut)
        options.viewport.zoom,
        options.viewport.panX,
        options.viewport.panY,
        imageAspect,
        imageAspect, // canvasAspect = imageAspect for 1:1 offscreen
        this.transparent ? 1.0 : 0.0,
        getTransferFunctionIndex(textureInfo.transferFunction),
        getObjectFitIndex(options.objectFit),
        1.0, // pixelScaleX: 1:1 pixel mapping
        1.0, // pixelScaleY: 1:1 pixel mapping
        outputTFIndex,        // outputTransferFunction
        textureInfo.bitDepth, // bitDepth for sub-16 normalization
        0.0, 0.0, 0.0,        // _pad1, _pad2, _pad3
      ]);
      device.queue.writeBuffer(tempUniformBuffer, 0, uniforms.buffer);

      const commandEncoder = device.createCommandEncoder();

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: renderTexture.createView(),
          loadOp: 'clear',
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: this.transparent ? 0.0 : 1.0 },
          storeOp: 'store',
        }],
      });

      renderPass.setPipeline(exportPipeline);
      renderPass.setBindGroup(0, tempBindGroup);
      renderPass.draw(4);
      renderPass.end();

      commandEncoder.copyTextureToBuffer(
        { texture: renderTexture },
        { buffer: stagingBuffer, bytesPerRow },
        { width: imageWidth, height: imageHeight }
      );

      device.queue.submit([commandEncoder.finish()]);

      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const mappedRange = stagingBuffer.getMappedRange();

      const processor = this.textureManager.getProcessor();
      const rawData = new Float16Array(mappedRange.slice(0));
      const readbackPixels = processor.unpadRows(
        rawData,
        imageWidth,
        imageHeight,
        bytesPerRow,
        2
      ) as Float16Array;

      stagingBuffer.unmap();

      // For linear float inputs: return Float16Array (linear values)
      // For integer-encoded inputs (sRGB/PQ): scale to Uint16Array [0, 2^bitDepth - 1]
      let pixels: Uint8Array | Uint16Array | Float16Array | Float32Array;
      if (textureInfo.transferFunction === 'linear') {
        pixels = readbackPixels;
      } else {
        const maxVal = (2 ** textureInfo.bitDepth) - 1;
        const uint16 = new Uint16Array(readbackPixels.length);
        for (let i = 0; i < readbackPixels.length; i++) {
          uint16[i] = Math.round(Math.min(Math.max(readbackPixels[i], 0), 1) * maxVal);
        }
        pixels = uint16;
      }

      return {
        pixels,
        width: imageWidth,
        height: imageHeight,
        format: exportFormat,
        colorSpace: options.colorSpace,
        bitDepth: textureInfo.bitDepth,
      };
    } finally {
      tempUniformBuffer.destroy();
      renderTexture.destroy();
      stagingBuffer.destroy();
    }
  }

  /**
   * Cleanup resources
   * Note: Does NOT destroy the shared GPUDevice - only local resources
   */
  private cleanup(): void {
    this.logger.log('[WebGPURenderer] Destroying renderer');

    if (this.textureManager) {
      this.textureManager.destroy();
    }
    if (this.pipelineManager) {
      this.pipelineManager.destroy();
    }
  }
}
