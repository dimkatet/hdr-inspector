/**
 * Render Pipeline Manager
 *
 * Manages WebGPU render pipeline creation, shaders, bind groups, and samplers.
 * Handles pipeline recreation when texture format changes.
 */

import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import { fragmentShaderWGSL, vertexShaderWGSL } from './shaders';

export interface PipelineConfig {
  canvasFormat: GPUTextureFormat;
  textureFormat: GPUTextureFormat;
}

export class RenderPipelineManager {
  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private sampler: GPUSampler | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private currentTextureFormat: GPUTextureFormat | null = null;

  constructor(
    private device: GPUDevice,
    private logger: Logger = silentLogger
  ) {}

  /**
   * Initialize uniform buffer
   */
  initialize(): void {
    // Create uniform buffer (16 floats * 4 bytes = 64 bytes)
    // Fields: exposure, toneMapping, visualizationMode, hdrMode, colorSpace,
    //         zoom, panX, panY, imageAspect, canvasAspect, transparent, transferFunction,
    //         objectFit, pixelScaleX, pixelScaleY, padding
    this.uniformBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create initial sampler (non-filtering for rgba32float compatibility)
    this.sampler = this.device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this.logger.log('[RenderPipelineManager] Initialized successfully');
  }

  /**
   * Create or recreate render pipeline
   */
  createPipeline(config: PipelineConfig, texture: GPUTexture): void {
    this.logger.log('[RenderPipelineManager] Creating render pipeline');

    // Create shader module
    const shaderModule = this.device.createShaderModule({
      code: `${vertexShaderWGSL}\n\n${fragmentShaderWGSL}`,
    });

    // Check for shader compilation errors
    shaderModule.getCompilationInfo().then((info) => {
      if (info.messages.length > 0) {
        this.logger.warn('[RenderPipelineManager] Shader compilation messages:', info.messages);
      }
    });

    // Determine sample type based on texture format
    const sampleType = config.textureFormat === 'rgba32float' ? 'unfilterable-float' : 'float';
    const samplerType = config.textureFormat === 'rgba32float' ? 'non-filtering' : 'filtering';

    // Update sampler if texture format changed
    if (config.textureFormat !== this.currentTextureFormat) {
      if (config.textureFormat !== 'rgba32float') {
        this.sampler = this.device.createSampler({
          magFilter: 'linear',
          minFilter: 'linear',
          addressModeU: 'clamp-to-edge',
          addressModeV: 'clamp-to-edge',
        });
      } else {
        // Recreate non-filtering sampler for rgba32float
        this.sampler = this.device.createSampler({
          magFilter: 'nearest',
          minFilter: 'nearest',
          addressModeU: 'clamp-to-edge',
          addressModeV: 'clamp-to-edge',
        });
      }
      this.currentTextureFormat = config.textureFormat;
    }

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: samplerType },
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
            format: config.canvasFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });

    // Create bind group
    if (!this.sampler) {
      throw new Error('Sampler not initialized');
    }

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: texture.createView(),
        },
        {
          binding: 1,
          resource: this.sampler,
        },
        {
          binding: 2,
          resource: { buffer: this.uniformBuffer! },
        },
      ],
    });

    this.logger.log('[RenderPipelineManager] Render pipeline created successfully');
  }

  /**
   * Get render pipeline
   */
  getPipeline(): GPURenderPipeline {
    if (!this.pipeline) {
      throw new Error('Pipeline not created');
    }
    return this.pipeline;
  }

  /**
   * Get bind group
   */
  getBindGroup(): GPUBindGroup {
    if (!this.bindGroup) {
      throw new Error('Bind group not created');
    }
    return this.bindGroup;
  }

  /**
   * Get uniform buffer
   */
  getUniformBuffer(): GPUBuffer {
    if (!this.uniformBuffer) {
      throw new Error('Uniform buffer not initialized');
    }
    return this.uniformBuffer;
  }

  /**
   * Get sampler
   */
  getSampler(): GPUSampler {
    if (!this.sampler) {
      throw new Error('Sampler not initialized');
    }
    return this.sampler;
  }

  /**
   * Check if pipeline is ready
   */
  isReady(): boolean {
    return this.pipeline !== null && this.bindGroup !== null;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
      this.uniformBuffer = null;
    }
    this.pipeline = null;
    this.bindGroup = null;
    this.sampler = null;
    this.logger.log('[RenderPipelineManager] Destroyed');
  }
}
