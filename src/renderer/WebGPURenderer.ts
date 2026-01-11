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
  private supportsHDR: boolean = false;
  private currentHDRMode: boolean = false;

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
    this.supportsHDR = await this.checkHDRSupport();
    console.log('[WebGPURenderer] HDR support:', this.supportsHDR);

    // Configure canvas context for HDR output
    // CRITICAL: For HDR output, we need:
    // 1. rgba16float format (to store values > 1.0)
    // 2. toneMapping: { mode: 'extended' } (tells browser NOT to apply its own tone mapping)
    // 3. colorSpace matching display capabilities

    const preferredColorSpace = this.getPreferredColorSpace(false); // SDR for initial config
    console.log('[WebGPURenderer] Trying color space:', preferredColorSpace);
    console.log('[WebGPURenderer] HDR format:', this.supportsHDR ? 'rgba16float' : preferredFormat);

    // Try to configure with preferred settings
    try {
      const config: GPUCanvasConfiguration = {
        device: this.device,
        format: this.supportsHDR ? 'rgba16float' : preferredFormat,
        alphaMode: 'opaque',
        colorSpace: preferredColorSpace as PredefinedColorSpace,
      };

      // CRITICAL: toneMapping.mode = 'extended' tells the browser:
      // "Don't apply any tone mapping, I'm giving you values in extended range [0, max_nits]"
      // This is REQUIRED for HDR output to work correctly
      if (this.supportsHDR) {
        config.toneMapping = { mode: 'extended' };
      }

      this.context.configure(config);
      console.log('[WebGPURenderer] Successfully configured:', {
        format: config.format,
        colorSpace: config.colorSpace,
        toneMapping: config.toneMapping,
      });
    } catch (error) {
      // If preferred color space fails (e.g., rec2020 on Safari), fallback
      console.warn('[WebGPURenderer] Failed to configure with', preferredColorSpace, error);

      const fallback = preferredColorSpace === 'rec2020' ? 'display-p3' : 'srgb';
      console.log('[WebGPURenderer] Trying fallback color space:', fallback);

      const config: GPUCanvasConfiguration = {
        device: this.device,
        format: this.supportsHDR ? 'rgba16float' : preferredFormat,
        alphaMode: 'opaque',
        colorSpace: fallback as PredefinedColorSpace,
      };

      if (this.supportsHDR) {
        config.toneMapping = { mode: 'extended' };
      }

      this.context.configure(config);
      console.log('[WebGPURenderer] Configured with fallback:', {
        format: config.format,
        colorSpace: config.colorSpace,
        toneMapping: config.toneMapping,
      });
    }

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
   * Get preferred color space for canvas configuration
   *
   * @param hdrMode - true for HDR rendering, false for SDR
   *
   * HDR mode: Returns linear color spaces (srgb-linear) for linear RGB output
   * SDR mode: Returns standard color spaces (srgb) for gamma-encoded output
   *
   * Future: Could return rec2020/display-p3 for PQ/HLG emulation modes
   */
  private getPreferredColorSpace(hdrMode: boolean): 'srgb' | 'srgb-linear' | 'display-p3' | 'rec2020' {
    if (hdrMode) {
      // HDR mode: Use linear color space
      // Browser will apply PQ encoding automatically with toneMapping: extended
      return 'srgb-linear';
    } else {
      // SDR mode: Use standard sRGB
      // We'll apply sRGB encoding in shader
      return 'srgb';
    }
  }

  /**
   * Reconfigure canvas color space when HDR mode changes
   */
  private reconfigureCanvas(hdrMode: boolean): void {
    const colorSpace = this.getPreferredColorSpace(hdrMode);
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();

    console.log('[WebGPURenderer] Reconfiguring canvas for', hdrMode ? 'HDR' : 'SDR');
    console.log('  - Color space:', colorSpace);

    const config: GPUCanvasConfiguration = {
      device: this.device,
      format: this.supportsHDR ? 'rgba16float' : preferredFormat,
      alphaMode: 'opaque',
      colorSpace: colorSpace as PredefinedColorSpace,
    };

    if (this.supportsHDR) {
      config.toneMapping = { mode: 'extended' };
    }

    this.context.configure(config);
  }

  /**
   * Check if HDR rendering is supported
   */
  private async checkHDRSupport(): Promise<boolean> {
    try {
      // Check if rgba16float is supported
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;

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
    // Reconfigure canvas if HDR mode changed
    if (options.hdrMode !== this.currentHDRMode) {
      this.reconfigureCanvas(options.hdrMode);
      this.currentHDRMode = options.hdrMode;
    }

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
