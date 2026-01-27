/**
 * WebGPU HDR Renderer
 *
 * Renders linear HDR images with explicit exposure and tone mapping.
 * Supports native HDR output via PQ encoding when available.
 */

import type {
  ColorSpace,
  ImageData,
  TransferFunction,
  ViewportState,
} from "../types";
import type { Logger } from "../logger";
import { silentLogger } from "../logger";
import { fragmentShaderWGSL, vertexShaderWGSL } from "./shaders";
import { getSharedDevice } from "./gpu-device";
import { ImagePreprocessor } from "./ImagePreprocessor";

export interface WebGPURenderOptions {
  exposure: number;
  toneMapping: "none" | "reinhard" | "aces";
  visualizationMode: "rgb" | "luminance" | "clipping";
  hdrMode: boolean; // true = PQ output, false = sRGB output
  colorSpace: ColorSpace; // Color space for output
  viewport: ViewportState; // Zoom and pan state
}

export interface WebGPURendererOptions {
  transparent?: boolean;
  logger?: Logger;
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
  private supportsHDR = false;
  private currentHDRMode = false;
  private currentColorSpace: ColorSpace = "srgb";
  private imageWidth = 1;
  private imageHeight = 1;
  private transparent = false;
  private currentTextureFormat: GPUTextureFormat = "rgba32float";
  private currentTransferFunction: TransferFunction = "linear";
  private logger: Logger;
  private preprocessor: ImagePreprocessor;

  constructor(canvas: HTMLCanvasElement, options: WebGPURendererOptions = {}) {
    this.canvas = canvas;
    this.transparent = options.transparent ?? false;
    this.logger = options.logger ?? silentLogger;
    this.preprocessor = new ImagePreprocessor(this.logger);
  }

  /**
   * Initialize WebGPU context and resources
   */
  async initialize(): Promise<void> {
    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported in this browser");
    }

    // Get shared device (singleton)
    this.device = await getSharedDevice();

    // Get canvas context
    const context = this.canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Failed to get WebGPU context");
    }
    this.context = context;

    // Check HDR support
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
    this.logger.log("[WebGPURenderer] Preferred format:", preferredFormat);

    // Configure context for HDR (will try rgba16float, fallback to bgra8unorm)
    this.supportsHDR = await this.checkHDRSupport();
    this.logger.log("[WebGPURenderer] HDR support:", this.supportsHDR);

    // Configure canvas context for HDR output
    // CRITICAL: For HDR output, we need:
    // 1. rgba16float format (to store values > 1.0)
    // 2. toneMapping: { mode: 'extended' } (tells browser NOT to apply its own tone mapping)
    // 3. colorSpace matching display capabilities

    const preferredColorSpace = "srgb"; // sRGB for initial config
    this.logger.log(
      "[WebGPURenderer] Trying color space:",
      preferredColorSpace,
    );
    this.logger.log(
      "[WebGPURenderer] HDR format:",
      this.supportsHDR ? "rgba16float" : preferredFormat,
    );

    // Try to configure with preferred settings
    try {
      const config: GPUCanvasConfiguration = {
        device: this.device,
        format: this.supportsHDR ? "rgba16float" : preferredFormat,
        alphaMode: this.transparent ? "premultiplied" : "opaque",
        colorSpace: preferredColorSpace as PredefinedColorSpace,
      };

      // CRITICAL: toneMapping.mode = 'extended' tells the browser:
      // "Don't apply any tone mapping, I'm giving you values in extended range [0, max_nits]"
      // This is REQUIRED for HDR output to work correctly
      if (this.supportsHDR) {
        config.toneMapping = { mode: "extended" };
      }

      this.context.configure(config);
      this.logger.log("[WebGPURenderer] Successfully configured:", {
        format: config.format,
        colorSpace: config.colorSpace,
        toneMapping: config.toneMapping,
      });
    } catch (error) {
      // If preferred color space fails (e.g., rec2020 on Safari), fallback
      this.logger.warn(
        "[WebGPURenderer] Failed to configure with",
        preferredColorSpace,
        error,
      );

      const fallback = "srgb";
      this.logger.log(
        "[WebGPURenderer] Trying fallback color space:",
        fallback,
      );

      const config: GPUCanvasConfiguration = {
        device: this.device,
        format: this.supportsHDR ? "rgba16float" : preferredFormat,
        alphaMode: this.transparent ? "premultiplied" : "opaque",
        colorSpace: fallback as PredefinedColorSpace,
      };

      if (this.supportsHDR) {
        config.toneMapping = { mode: "extended" };
      }

      this.context.configure(config);
      this.logger.log("[WebGPURenderer] Configured with fallback:", {
        format: config.format,
        colorSpace: config.colorSpace,
        toneMapping: config.toneMapping,
      });
    }

    // Create sampler (will be updated when texture format changes)
    // Start with non-filtering for rgba32float compatibility
    this.sampler = this.device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    // Create uniform buffer (exposure, toneMapping, visualizationMode, hdrMode, colorSpace, zoom, panX, panY, imageAspect, canvasAspect, transparent, inputTransferFunction)
    this.uniformBuffer = this.device.createBuffer({
      size: 48, // 12 floats * 4 bytes = 48 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Initialize image preprocessor (compute pipeline for RGB→RGBA, bit depth remapping)
    await this.preprocessor.initialize();

    this.logger.log("[WebGPURenderer] Initialized successfully");
  }

  /**
   * Map ColorSpace to canvas color space
   *
   * @param renderState - Render options containing colorSpace and hdrMode
   *
   * Both HDR and SDR modes use standard (non-linear) color spaces:
   * - 'srgb', 'display-p3', 'rec2020'
   * - Linear variants ('srgb-linear', 'display-p3-linear') are experimental
   *   and not widely supported, so we use standard color spaces everywhere
   *
   * HDR mode:
   * - Shader applies color space transform + sRGB transfer function
   * - Values > 1.0 are preserved in rgba16float buffer
   * - toneMapping: extended mode passes HDR values to display
   *
   * SDR mode:
   * - Shader applies tone mapping + color space transform + sRGB transfer function
   * - Values clamped to [0, 1] for bgra8unorm buffer
   */
  private getCanvasColorSpace(
    renderState: WebGPURenderOptions,
  ): "srgb" | "display-p3" | "rec2020" {
    const { colorSpace } = renderState;

    // Use standard (non-linear) color spaces for both HDR and SDR
    if (colorSpace === "display-p3") {
      return "display-p3";
    }
    if (colorSpace === "rec2020") {
      return "rec2020";
    }
    return "srgb";
  }

  /**
   * Reconfigure canvas when HDR mode or color space changes
   */
  private reconfigureCanvas(renderState: WebGPURenderOptions): void {
    const canvasColorSpace = this.getCanvasColorSpace(renderState);
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();

    this.logger.log(
      "[WebGPURenderer] Reconfiguring canvas for",
      renderState.hdrMode ? "HDR" : "SDR",
    );
    this.logger.log("  - User color space:", renderState.colorSpace);
    this.logger.log("  - Canvas color space:", canvasColorSpace);

    const config: GPUCanvasConfiguration = {
      device: this.device,
      format: this.supportsHDR ? "rgba16float" : preferredFormat,
      alphaMode: this.transparent ? "premultiplied" : "opaque",
      colorSpace: canvasColorSpace as PredefinedColorSpace,
    };

    if (this.supportsHDR) {
      config.toneMapping = { mode: "extended" };
    }

    this.context.configure(config);
  }

  /**
   * Check if HDR rendering is supported
   */
  private async checkHDRSupport(): Promise<boolean> {
    try {
      // Try to create a test texture with rgba16float
      const testTexture = this.device.createTexture({
        size: { width: 1, height: 1 },
        format: "rgba16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      testTexture.destroy();

      // Check display HDR support via media query
      const displayHDR = window.matchMedia("(dynamic-range: high)").matches;

      return displayHDR;
    } catch (e) {
      this.logger.warn("[WebGPURenderer] HDR check failed:", e);
      return false;
    }
  }

  /**
   * Upload image to GPU texture.
   * Delegates preprocessing (RGB→RGBA, bit depth remapping) to ImagePreprocessor.
   */
  async uploadImage(image: ImageData): Promise<void> {
    this.imageWidth = image.width;
    this.imageHeight = image.height;
    this.currentTransferFunction = image.transferFunction;

    if (this.texture) {
      this.texture.destroy();
    }

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
        { width: image.width, height: image.height },
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
        { width: result.width, height: result.height },
      );
      this.device.queue.submit([encoder.finish()]);

      result.destroy();
    }

    this.createPipeline();
  }

  /**
   * Create render pipeline
   */
  private createPipeline(): void {
    this.logger.log("[WebGPURenderer] Creating render pipeline");

    // Create shader module
    const shaderModule = this.device.createShaderModule({
      code: `${vertexShaderWGSL}\n\n${fragmentShaderWGSL}`,
    });

    // Check for shader compilation errors
    shaderModule.getCompilationInfo().then((info) => {
      if (info.messages.length > 0) {
        this.logger.warn(
          "[WebGPURenderer] Shader compilation messages:",
          info.messages,
        );
      }
    });

    // Determine sample type based on texture format
    const sampleType =
      this.currentTextureFormat === "rgba32float"
        ? "unfilterable-float"
        : "float";
    const samplerType =
      this.currentTextureFormat === "rgba32float"
        ? "non-filtering"
        : "filtering";

    // Update sampler if texture format changed
    if (this.currentTextureFormat !== "rgba32float") {
      this.sampler = this.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
    } else {
      // Recreate non-filtering sampler for rgba32float
      this.sampler = this.device.createSampler({
        magFilter: "nearest",
        minFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
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
          buffer: { type: "uniform" },
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
        entryPoint: "vs_main",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: this.context.getCurrentTexture().format,
          },
        ],
      },
      primitive: {
        topology: "triangle-strip",
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

    this.logger.log("[WebGPURenderer] Render pipeline created successfully");
  }

  /**
   * Render with current settings
   */
  render(options: WebGPURenderOptions): void {
    // Skip render if pipeline not ready (no image loaded yet)
    if (!this.pipeline || !this.bindGroup || !this.texture) {
      this.logger.warn("[WebGPURenderer] Skipping render - pipeline not ready");
      return;
    }

    // Reconfigure canvas if HDR mode or color space changed
    if (
      options.hdrMode !== this.currentHDRMode ||
      options.colorSpace !== this.currentColorSpace
    ) {
      this.reconfigureCanvas(options);
      this.currentHDRMode = options.hdrMode;
      this.currentColorSpace = options.colorSpace;
    }

    // Update uniforms
    const imageAspect = this.imageWidth / this.imageHeight;
    const canvasAspect = this.canvas.width / this.canvas.height;

    const uniforms = new Float32Array([
      options.exposure,
      this.getToneMappingIndex(options.toneMapping),
      this.getVisualizationModeIndex(options.visualizationMode),
      options.hdrMode ? 1.0 : 0.0,
      this.getColorSpaceIndex(options.colorSpace),
      options.viewport.zoom,
      options.viewport.panX,
      options.viewport.panY,
      imageAspect,
      canvasAspect,
      this.transparent ? 1.0 : 0.0,
      this.getTransferFunctionIndex(this.currentTransferFunction),
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
          loadOp: "clear",
          clearValue: {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: this.transparent ? 0.0 : 1.0,
          },
          storeOp: "store",
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
      case "none":
        return 0;
      case "reinhard":
        return 1;
      case "aces":
        return 2;
      default:
        return 1;
    }
  }

  private getVisualizationModeIndex(mode: string): number {
    switch (mode) {
      case "rgb":
        return 0;
      case "luminance":
        return 1;
      case "clipping":
        return 2;
      default:
        return 0;
    }
  }

  private getColorSpaceIndex(colorSpace: ColorSpace): number {
    switch (colorSpace) {
      case "srgb":
        return 0;
      case "display-p3":
        return 1;
      case "rec2020":
        return 2;
    }
  }

  private getTransferFunctionIndex(transferFunction: TransferFunction): number {
    switch (transferFunction) {
      case "linear":
        return 0;
      case "srgb":
        return 1;
      case "pq":
        return 2;
    }
  }

  /**
   * Get loaded image dimensions
   */
  getImageDimensions(): { width: number; height: number } {
    return { width: this.imageWidth, height: this.imageHeight };
  }

  /**
   * Cleanup resources
   * Note: Does NOT destroy the shared GPUDevice - only local resources
   */
  destroy(): void {
    this.logger.log("[WebGPURenderer] Destroying renderer");

    if (this.texture) this.texture.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    this.preprocessor.destroy();
  }
}
