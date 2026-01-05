/**
 * WebGPU HDR Renderer
 *
 * Renders linear HDR images with explicit exposure and tone mapping.
 * Supports native HDR output via PQ encoding when available.
 */

import type { LinearImage } from '../types';
import { vertexShaderWGSL, fragmentShaderWGSL } from './shaders-webgpu';

export interface WebGPURenderOptions {
  exposure: number;
  toneMapping: 'none' | 'reinhard' | 'aces';
  visualizationMode: 'rgb' | 'luminance' | 'clipping';
  hdrMode: boolean; // true = PQ output, false = sRGB output
}

export class WebGPURenderer {
  private canvas: HTMLCanvasElement;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private pipeline!: GPURenderPipeline;
  private bindGroup!: GPUBindGroup;
  private texture!: GPUTexture;
  private sampler!: GPUSampler;
  private uniformBuffer!: GPUBuffer;

  private imageWidth = 0;
  private imageHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * Initialize WebGPU context and resources
   */
  async initialize(): Promise<void> {
    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    // Request adapter and device
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    this.device = await adapter.requestDevice();

    // Get canvas context
    const context = this.canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Failed to get WebGPU context');
    }
    this.context = context;

    // Check HDR support
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
    console.log('[WebGPURenderer] Preferred format:', preferredFormat);

    // Configure context for HDR (will try rgba16float, fallback to bgra8unorm)
    const supportsHDR = await this.checkHDRSupport();
    console.log('[WebGPURenderer] HDR support:', supportsHDR);

    // Configure canvas context
    this.context.configure({
      device: this.device,
      format: supportsHDR ? 'rgba16float' : preferredFormat,
      alphaMode: 'opaque',
      // @ts-ignore - colorSpace is experimental but works
      colorSpace: supportsHDR ? 'rec2020' : 'srgb',
      // @ts-ignore - toneMapping is experimental
      toneMapping: supportsHDR ? { mode: 'extended' } : undefined,
    });

    // Create sampler
    this.sampler = this.device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    // Create uniform buffer (exposure, toneMapping, visualizationMode, hdrMode, padding)
    this.uniformBuffer = this.device.createBuffer({
      size: 16, // 4 floats * 4 bytes = 16 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    console.log('[WebGPURenderer] Initialized successfully');
  }

  /**
   * Check if HDR rendering is supported
   */
  private async checkHDRSupport(): Promise<boolean> {
    try {
      // Check if rgba16float is supported
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;

      // Check format capabilities
      const canvasFormats = navigator.gpu.getPreferredCanvasFormat();

      // Try to create a test texture with rgba16float
      const testTexture = this.device.createTexture({
        size: { width: 1, height: 1 },
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      testTexture.destroy();

      // Check display HDR support via media query
      const displayHDR = window.matchMedia('(dynamic-range: high)').matches;

      return displayHDR;
    } catch (e) {
      console.warn('[WebGPURenderer] HDR check failed:', e);
      return false;
    }
  }

  /**
   * Upload HDR image to GPU texture
   */
  uploadImage(image: LinearImage): void {
    console.log('[WebGPURenderer] Uploading image:', image.width, 'x', image.height);

    this.imageWidth = image.width;
    this.imageHeight = image.height;

    // Update canvas size to match image
    this.canvas.width = image.width;
    this.canvas.height = image.height;

    console.log('[WebGPURenderer] Canvas size:', this.canvas.width, 'x', this.canvas.height);

    // Destroy old texture if exists
    if (this.texture) {
      this.texture.destroy();
    }

    // Convert RGB to RGBA (WebGPU requires rgba16float for HDR)
    const rgbaData = new Float32Array(image.width * image.height * 4);
    for (let i = 0; i < image.width * image.height; i++) {
      rgbaData[i * 4] = image.data[i * 3];         // R
      rgbaData[i * 4 + 1] = image.data[i * 3 + 1]; // G
      rgbaData[i * 4 + 2] = image.data[i * 3 + 2]; // B
      rgbaData[i * 4 + 3] = 1.0;                    // A
    }

    // Create texture (use rgba32float for Float32Array compatibility)
    this.texture = this.device.createTexture({
      size: { width: image.width, height: image.height },
      format: 'rgba32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Write texture data
    this.device.queue.writeTexture(
      { texture: this.texture },
      rgbaData.buffer,
      {
        offset: 0,
        bytesPerRow: image.width * 4 * 4, // 4 channels * 4 bytes (f32)
        rowsPerImage: image.height,
      },
      { width: image.width, height: image.height }
    );

    // Create pipeline and bind group
    this.createPipeline();

    console.log('[WebGPURenderer] Image uploaded successfully');
  }

  /**
   * Create render pipeline
   */
  private createPipeline(): void {
    // Create shader module
    const shaderModule = this.device.createShaderModule({
      code: vertexShaderWGSL + '\n\n' + fragmentShaderWGSL,
    });

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'unfilterable-float' }, // rgba32float is unfilterable
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'non-filtering' }, // Must match unfilterable texture
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    // Create pipeline
    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.context.getCurrentTexture().format,
          },
        ],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });

    // Create bind group
    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.texture.createView(),
        },
        {
          binding: 1,
          resource: this.sampler,
        },
        {
          binding: 2,
          resource: { buffer: this.uniformBuffer },
        },
      ],
    });
  }

  /**
   * Render with current settings
   */
  render(options: WebGPURenderOptions): void {
    // Update uniforms
    const uniforms = new Float32Array([
      options.exposure,
      this.getToneMappingIndex(options.toneMapping),
      this.getVisualizationModeIndex(options.visualizationMode),
      options.hdrMode ? 1.0 : 0.0,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms.buffer);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();

    // Get current texture view
    const textureView = this.context.getCurrentTexture().createView();

    // Create render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          loadOp: 'clear',
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.draw(4); // Fullscreen quad (triangle strip)
    renderPass.end();

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private getToneMappingIndex(mode: string): number {
    switch (mode) {
      case 'none': return 0;
      case 'reinhard': return 1;
      case 'aces': return 2;
      default: return 1;
    }
  }

  private getVisualizationModeIndex(mode: string): number {
    switch (mode) {
      case 'rgb': return 0;
      case 'luminance': return 1;
      case 'clipping': return 2;
      default: return 0;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    console.log('[WebGPURenderer] Destroying renderer');

    if (this.texture) this.texture.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    if (this.device) this.device.destroy();
  }
}
