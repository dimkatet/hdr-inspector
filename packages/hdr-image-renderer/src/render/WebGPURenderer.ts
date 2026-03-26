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
import type { PostProcessingChain } from '../post-processing/PostProcessingChain';
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
import { blitFragmentShaderWGSL, vertexShaderWGSL } from './shaders';
import { TextureManager } from './TextureManager';

export interface WebGPURendererOptions {
  transparent?: boolean;
  logger?: Logger;
  postProcessingChain?: PostProcessingChain;
}

export class WebGPURenderer implements Renderer, RuntimeService {
  private canvas: HTMLCanvasElement;
  private transparent = false;
  private logger: Logger;

  // Service modules
  private contextManager: GPUContextManager;
  private textureManager: TextureManager | null = null;
  private pipelineManager: RenderPipelineManager | null = null;

  // Optional post-processing chain (lazy path)
  private postProcessingChain: PostProcessingChain | null = null;

  // Blit pipeline cache: canvasFormat → pipeline (for rgba16float → swapChain blit)
  private blitPipelineCache = new Map<GPUTextureFormat, GPURenderPipeline>();
  private blitBindGroupLayout: GPUBindGroupLayout | null = null;
  private blitSampler: GPUSampler | null = null;

  constructor(canvas: HTMLCanvasElement, options: WebGPURendererOptions = {}) {
    this.canvas = canvas;
    this.transparent = options.transparent ?? false;
    this.logger = options.logger ?? silentLogger;
    this.postProcessingChain = options.postProcessingChain ?? null;

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
   * Render with current settings.
   *
   * Lazy post-processing path (when chain has passes):
   *   main pass → chain.pingTexture → N user passes (ping-pong) → blit → swapChain
   *
   * Direct path (no passes, zero overhead):
   *   main pass → swapChain
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
      imageWidth / this.canvas.width,
      imageHeight / this.canvas.height,
      1.0, // outputTransferFunction: sRGB EOTF⁻¹ (display)
      textureInfo.bitDepth, // bitDepth for sub-16 normalization
      0.0,
      0.0,
      0.0, // _pad1, _pad2, _pad3
    ]);

    const device = this.contextManager.getDevice();
    device.queue.writeBuffer(this.pipelineManager.getUniformBuffer(), 0, uniforms.buffer);

    const commandEncoder = device.createCommandEncoder();
    const context = this.contextManager.getContext();

    if (this.postProcessingChain?.hasPasses) {
      // Lazy path: render to intermediate texture → chain passes → blit to swapChain
      const inputTex = this.postProcessingChain.acquireInputTexture(
        device,
        this.canvas.width,
        this.canvas.height
      )!;

      this.encodeImagePass(commandEncoder, inputTex.createView());

      const finalTex = this.postProcessingChain.encodeCanvasPasses(commandEncoder);

      this.encodeBlit(
        commandEncoder,
        finalTex.createView(),
        context.getCurrentTexture().createView(),
        this.contextManager.getCanvasFormat()
      );
    } else {
      // Direct path: render straight to swapChain (no overhead)
      this.encodeImagePass(commandEncoder, context.getCurrentTexture().createView());
    }

    device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Encode the main image render pass into an arbitrary output view.
   * Uses the current pipeline and bind group (set up in uploadImage / render).
   */
  private encodeImagePass(encoder: GPUCommandEncoder, outputView: GPUTextureView): void {
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: this.transparent ? 0.0 : 1.0 },
          storeOp: 'store',
        },
      ],
    });
    renderPass.setPipeline(this.pipelineManager!.getPipeline());
    renderPass.setBindGroup(0, this.pipelineManager!.getBindGroup());
    renderPass.draw(4);
    renderPass.end();
  }

  /**
   * Blit from an rgba16float source to a (potentially different format) destination.
   * Used as the final step in the post-processing path.
   * Cached by output format — created once per canvas format (typically 1-2 variants).
   */
  private encodeBlit(
    encoder: GPUCommandEncoder,
    inputView: GPUTextureView,
    outputView: GPUTextureView,
    outputFormat: GPUTextureFormat
  ): void {
    const device = this.contextManager.getDevice();
    const pipeline = this.getOrCreateBlitPipeline(device, outputFormat);

    const bindGroup = device.createBindGroup({
      layout: this.blitBindGroupLayout!,
      entries: [
        { binding: 0, resource: inputView },
        { binding: 1, resource: this.blitSampler! },
      ],
    });

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: outputView,
          loadOp: 'clear',
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: this.transparent ? 0.0 : 1.0 },
          storeOp: 'store',
        },
      ],
    });
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(4);
    renderPass.end();
  }

  /**
   * Get or create a blit pipeline targeting the given output format.
   * Blit bind group layout: binding 0 = texture (float), binding 1 = sampler (filtering).
   */
  private getOrCreateBlitPipeline(
    device: GPUDevice,
    outputFormat: GPUTextureFormat
  ): GPURenderPipeline {
    const cached = this.blitPipelineCache.get(outputFormat);
    if (cached) return cached;

    if (!this.blitBindGroupLayout) {
      this.blitBindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      });
    }

    if (!this.blitSampler) {
      this.blitSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });
    }

    const shaderModule = device.createShaderModule({
      code: `${vertexShaderWGSL}\n\n${blitFragmentShaderWGSL}`,
    });

    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.blitBindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'blit_main',
        targets: [{ format: outputFormat }],
      },
      primitive: { topology: 'triangle-strip' },
    });

    this.blitPipelineCache.set(outputFormat, pipeline);
    this.logger.log('[WebGPURenderer] Blit pipeline created for format:', outputFormat);
    return pipeline;
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

    // Create offscreen rgba16float render target.
    // TEXTURE_BINDING added so the chain can read it as input when post-processing is active.
    const renderTexture = device.createTexture({
      size: { width: imageWidth, height: imageHeight },
      format: exportFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
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

    let ppTempTextures: GPUTexture[] = [];

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
        outputTFIndex, // outputTransferFunction
        textureInfo.bitDepth, // bitDepth for sub-16 normalization
        0.0,
        0.0,
        0.0, // _pad1, _pad2, _pad3
      ]);
      device.queue.writeBuffer(tempUniformBuffer, 0, uniforms.buffer);

      const commandEncoder = device.createCommandEncoder();

      // Main export render pass → renderTexture
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
      renderPass.setPipeline(exportPipeline);
      renderPass.setBindGroup(0, tempBindGroup);
      renderPass.draw(4);
      renderPass.end();

      // Apply post-processing passes if active (renderTexture → chain temp textures → finalTexture)
      let finalTexture = renderTexture;
      if (this.postProcessingChain?.hasPasses) {
        const result = this.postProcessingChain.prepareOffscreenPasses(
          device,
          commandEncoder,
          renderTexture,
          imageWidth,
          imageHeight
        );
        finalTexture = result.finalTexture;
        ppTempTextures = result.tempTextures;
      }

      commandEncoder.copyTextureToBuffer(
        { texture: finalTexture },
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
        const maxVal = 2 ** textureInfo.bitDepth - 1;
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
      for (const tex of ppTempTextures) tex.destroy();
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
    this.blitPipelineCache.clear();
    this.blitBindGroupLayout = null;
    this.blitSampler = null;
  }
}
