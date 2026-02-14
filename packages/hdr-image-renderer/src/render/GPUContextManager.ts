/**
 * GPU Context Manager
 *
 * Manages WebGPU device, canvas context, and HDR support.
 * Handles canvas reconfiguration when color space or HDR mode changes.
 */

import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import type { ColorSpace } from '../types';
import { getSharedDevice } from './gpu-device';

export interface GPUContextConfig {
  transparent: boolean;
}

export interface WebGPURenderMode {
  hdrMode: boolean;
  colorSpace: ColorSpace;
}

export class GPUContextManager {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private canvasFormat!: GPUTextureFormat;
  private supportsHDR = false;
  private currentHDRMode = false;
  private currentColorSpace: ColorSpace = 'srgb';

  constructor(
    private canvas: HTMLCanvasElement,
    private config: GPUContextConfig,
    private logger: Logger = silentLogger
  ) {}

  /**
   * Initialize WebGPU context and check HDR support
   */
  async initialize(): Promise<void> {
    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    // Get shared device (singleton)
    this.device = await getSharedDevice();

    // Get canvas context
    const context = this.canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Failed to get WebGPU context');
    }
    this.context = context;

    // Check HDR support
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
    this.logger.log('[GPUContextManager] Preferred format:', preferredFormat);

    // Configure context for HDR (will try rgba16float, fallback to bgra8unorm)
    this.supportsHDR = await this.checkHDRSupport();
    this.logger.log('[GPUContextManager] HDR support:', this.supportsHDR);

    // Configure canvas context for initial settings
    const preferredColorSpace = 'srgb';
    this.logger.log('[GPUContextManager] Trying color space:', preferredColorSpace);
    this.logger.log(
      '[GPUContextManager] HDR format:',
      this.supportsHDR ? 'rgba16float' : preferredFormat
    );

    // Try to configure with preferred settings
    try {
      const config: GPUCanvasConfiguration = {
        device: this.device,
        format: this.supportsHDR ? 'rgba16float' : preferredFormat,
        alphaMode: this.config.transparent ? 'premultiplied' : 'opaque',
        colorSpace: preferredColorSpace as PredefinedColorSpace,
      };

      // CRITICAL: toneMapping.mode = 'extended' tells the browser:
      // "Don't apply any tone mapping, I'm giving you values in extended range [0, max_nits]"
      // This is REQUIRED for HDR output to work correctly
      if (this.supportsHDR) {
        config.toneMapping = { mode: 'extended' };
      }

      this.context.configure(config);
      this.canvasFormat = config.format;
      this.logger.log('[GPUContextManager] Successfully configured:', {
        format: config.format,
        colorSpace: config.colorSpace,
        toneMapping: config.toneMapping,
      });
    } catch (error) {
      // If preferred color space fails (e.g., rec2020 on Safari), fallback
      this.logger.warn('[GPUContextManager] Failed to configure with', preferredColorSpace, error);

      const fallback = 'srgb';
      this.logger.log('[GPUContextManager] Trying fallback color space:', fallback);

      const config: GPUCanvasConfiguration = {
        device: this.device,
        format: this.supportsHDR ? 'rgba16float' : preferredFormat,
        alphaMode: this.config.transparent ? 'premultiplied' : 'opaque',
        colorSpace: fallback as PredefinedColorSpace,
      };

      if (this.supportsHDR) {
        config.toneMapping = { mode: 'extended' };
      }

      this.context.configure(config);
      this.canvasFormat = config.format;
      this.logger.log('[GPUContextManager] Configured with fallback:', {
        format: config.format,
        colorSpace: config.colorSpace,
        toneMapping: config.toneMapping,
      });
    }

    this.logger.log('[GPUContextManager] Initialized successfully');
  }

  /**
   * Check if HDR rendering is supported
   */
  private async checkHDRSupport(): Promise<boolean> {
    try {
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
      this.logger.warn('[GPUContextManager] HDR check failed:', e);
      return false;
    }
  }

  /**
   * Map ColorSpace to canvas color space
   *
   * @param renderMode - Render mode containing colorSpace and hdrMode
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
  getCanvasColorSpace(renderMode: WebGPURenderMode): 'srgb' | 'display-p3' | 'rec2020' {
    const { colorSpace } = renderMode;

    // Use standard (non-linear) color spaces for both HDR and SDR
    if (colorSpace === 'display-p3') {
      return 'display-p3';
    }
    if (colorSpace === 'rec2020') {
      return 'rec2020';
    }
    return 'srgb';
  }

  /**
   * Reconfigure canvas when HDR mode or color space changes
   */
  reconfigure(renderMode: WebGPURenderMode): void {
    // Skip if already configured for this mode
    if (
      renderMode.hdrMode === this.currentHDRMode &&
      renderMode.colorSpace === this.currentColorSpace
    ) {
      return;
    }

    const canvasColorSpace = this.getCanvasColorSpace(renderMode);
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();

    this.logger.log(
      '[GPUContextManager] Reconfiguring canvas for',
      renderMode.hdrMode ? 'HDR' : 'SDR'
    );
    this.logger.log('  - User color space:', renderMode.colorSpace);
    this.logger.log('  - Canvas color space:', canvasColorSpace);

    const config: GPUCanvasConfiguration = {
      device: this.device,
      format: this.supportsHDR ? 'rgba16float' : preferredFormat,
      alphaMode: this.config.transparent ? 'premultiplied' : 'opaque',
      colorSpace: canvasColorSpace as PredefinedColorSpace,
    };

    if (this.supportsHDR) {
      config.toneMapping = { mode: 'extended' };
    }

    this.context.configure(config);

    // Update tracking
    this.currentHDRMode = renderMode.hdrMode;
    this.currentColorSpace = renderMode.colorSpace;
  }

  /**
   * Get GPU device (shared singleton)
   */
  getDevice(): GPUDevice {
    return this.device;
  }

  /**
   * Get canvas context
   */
  getContext(): GPUCanvasContext {
    return this.context;
  }

  /**
   * Get current canvas format (rgba16float or bgra8unorm/rgba8unorm)
   */
  getCanvasFormat(): GPUTextureFormat {
    return this.canvasFormat;
  }

  /**
   * Check if HDR is supported
   */
  isHDRSupported(): boolean {
    return this.supportsHDR;
  }
}
