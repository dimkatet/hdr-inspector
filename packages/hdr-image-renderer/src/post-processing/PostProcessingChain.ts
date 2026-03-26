/**
 * PostProcessingChain — manages the GPU post-processing pass pipeline.
 *
 * Design:
 *  - Lazy: textures are allocated only when at least one pass is registered.
 *  - Ping-pong: two rgba16float textures alternate as input/output across passes.
 *  - Format: all intermediate textures use rgba16float regardless of HDR/SDR mode.
 *    The final blit to the swap chain (handled by WebGPURenderer) converts to canvas format.
 *
 * Canvas rendering:
 *   renderer → pingTexture → [pass 0] → pongTexture → [pass 1] → pingTexture → ...
 *   → encodeBlit (renderer) → swapChain
 *
 * Export rendering:
 *   renderer → exportRenderTex → [passes, temp ping/pong] → finalTex → readback
 */

import type { DomainEventMap } from '../core/EventTypes';
import type { RuntimeContext, RuntimeService } from '../core/RuntimeService';
import type { TypedEventBus } from '../core/TypedEventBus';
import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import type { PostProcessingPass } from './PostProcessingPass';

/** Public API exposed via ServiceMap and PluginContext */
export interface PostProcessingAPI {
  /** Whether any passes are currently registered */
  readonly hasPasses: boolean;
  /** Register a pass. Safe to call before or after runtime starts. */
  addPass(pass: PostProcessingPass): void;
  /** Remove a pass by name and call its `dispose()`. */
  removePass(name: string): void;
  /**
   * Request a re-render. Call this after updating pass parameters
   * so the canvas reflects the change immediately.
   */
  requestRender(): void;
}

const INTERMEDIATE_FORMAT: GPUTextureFormat = 'rgba16float';

export class PostProcessingChain implements PostProcessingAPI, RuntimeService {
  private passes: PostProcessingPass[] = [];
  private initializedPassNames = new Set<string>();
  private device: GPUDevice | null = null;
  private eventBus: TypedEventBus<DomainEventMap> | null = null;
  private logger: Logger;

  // Canvas-sized ping-pong textures (lazy — allocated only when hasPasses is true)
  private pingTexture: GPUTexture | null = null;
  private pongTexture: GPUTexture | null = null;
  private textureWidth = 0;
  private textureHeight = 0;

  constructor(logger: Logger = silentLogger) {
    this.logger = logger;
  }

  // ============================================================
  // PostProcessingAPI (public, for plugins)
  // ============================================================

  get hasPasses(): boolean {
    return this.passes.length > 0;
  }

  addPass(pass: PostProcessingPass): void {
    if (this.passes.some((p) => p.name === pass.name)) {
      this.logger.warn(`[PostProcessingChain] Pass "${pass.name}" already registered, skipping`);
      return;
    }

    this.passes.push(pass);
    this.logger.log(
      `[PostProcessingChain] Pass "${pass.name}" added (total: ${this.passes.length})`
    );

    // Initialize immediately if device is available (runtime already running)
    if (this.device && !this.initializedPassNames.has(pass.name)) {
      this.initPass(pass);
    }

    this.eventBus?.emit('postProcessing:changed', {});
  }

  requestRender(): void {
    this.eventBus?.emit('postProcessing:changed', {});
  }

  removePass(name: string): void {
    const idx = this.passes.findIndex((p) => p.name === name);
    if (idx < 0) {
      this.logger.warn(`[PostProcessingChain] Pass "${name}" not found`);
      return;
    }

    try {
      this.passes[idx].dispose?.();
    } catch (err) {
      this.logger.warn(`[PostProcessingChain] Error disposing pass "${name}":`, err);
    }

    this.passes.splice(idx, 1);
    this.initializedPassNames.delete(name);
    this.logger.log(
      `[PostProcessingChain] Pass "${name}" removed (remaining: ${this.passes.length})`
    );

    if (this.passes.length === 0) {
      this.destroyCanvasTextures();
    }

    this.eventBus?.emit('postProcessing:changed', {});
  }

  // ============================================================
  // Internal API (used by WebGPURenderer only)
  // ============================================================

  /**
   * Get (or lazily create/resize) the ping texture for canvas rendering.
   * The renderer renders the main pass into this texture.
   *
   * Returns null if no passes are registered — caller should render directly to canvas.
   */
  acquireInputTexture(device: GPUDevice, width: number, height: number): GPUTexture | null {
    if (!this.hasPasses) return null;

    // Store device for lazy pass initialization
    if (!this.device) {
      this.device = device;
      this.initPendingPasses();
    }

    const needsResize = width !== this.textureWidth || height !== this.textureHeight;
    if (!this.pingTexture || needsResize) {
      this.destroyCanvasTextures();
      this.textureWidth = width;
      this.textureHeight = height;

      this.pingTexture = device.createTexture({
        size: { width, height },
        format: INTERMEDIATE_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        label: 'pp-ping',
      });

      this.pongTexture = device.createTexture({
        size: { width, height },
        format: INTERMEDIATE_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        label: 'pp-pong',
      });

      this.logger.log(`[PostProcessingChain] Canvas textures created ${width}x${height}`);
    }

    return this.pingTexture;
  }

  /**
   * Encode all passes for canvas rendering.
   * Must be called after renderer has rendered into `acquireInputTexture()`.
   *
   * Returns the final rgba16float texture — renderer blits it to the swap chain.
   */
  encodeCanvasPasses(encoder: GPUCommandEncoder): GPUTexture {
    if (!this.pingTexture || !this.pongTexture) {
      throw new Error('[PostProcessingChain] encodeCanvasPasses: textures not initialized');
    }
    return this.runPasses(encoder, this.pingTexture, this.pongTexture);
  }

  /**
   * Encode post-processing passes for the export (readPixels) path.
   * Creates temporary textures and encodes passes from `inputTex`.
   *
   * The caller MUST destroy all returned `tempTextures` after GPU submission.
   *
   * @param device   - GPU device (for creating temp textures)
   * @param encoder  - Command encoder to record into
   * @param inputTex - Main render output (image-sized rgba16float)
   * @param width    - Image width
   * @param height   - Image height
   */
  prepareOffscreenPasses(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    inputTex: GPUTexture,
    width: number,
    height: number
  ): { finalTexture: GPUTexture; tempTextures: GPUTexture[] } {
    if (this.passes.length === 0) {
      return { finalTexture: inputTex, tempTextures: [] };
    }

    const tempTextures: GPUTexture[] = [];

    const createTemp = (label: string): GPUTexture => {
      const tex = device.createTexture({
        size: { width, height },
        format: INTERMEDIATE_FORMAT,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
        label,
      });
      tempTextures.push(tex);
      return tex;
    };

    const pingTex = createTemp('export-pp-ping');
    const pongTex = createTemp('export-pp-pong');

    // First pass reads from the main render output (inputTex), not from ping/pong
    let currentInput = inputTex;
    let nextOutputIndex = 0; // 0 = pingTex, 1 = pongTex

    for (let i = 0; i < this.passes.length; i++) {
      const outputTex = nextOutputIndex === 0 ? pingTex : pongTex;
      this.passes[i].encode(encoder, currentInput.createView(), outputTex.createView());
      currentInput = outputTex;
      nextOutputIndex = 1 - nextOutputIndex;
    }

    return { finalTexture: currentInput, tempTextures };
  }

  // ============================================================
  // RuntimeService implementation
  // ============================================================

  async init(ctx: RuntimeContext): Promise<void> {
    // Device not available through ctx — passes are initialized lazily in
    // acquireInputTexture() when the device becomes available on first render.
    this.eventBus = ctx.eventBus;
    this.logger.log('[PostProcessingChain] Initialized');
  }

  start(): void {}

  stop(): void {
    this.destroyCanvasTextures();
    this.device = null;
    this.initializedPassNames.clear();
  }

  dispose(): void {
    for (const pass of this.passes) {
      try {
        pass.dispose?.();
      } catch (err) {
        this.logger.warn(`[PostProcessingChain] Error disposing pass "${pass.name}":`, err);
      }
    }
    this.destroyCanvasTextures();
  }

  // ============================================================
  // Private
  // ============================================================

  /**
   * Run N passes using ping-pong between pingTex and pongTex.
   * Starting texture is pingTex (renderer already rendered into it).
   *
   *   pass 0: ping → pong
   *   pass 1: pong → ping
   *   pass 2: ping → pong
   *   ...
   *
   * Returns the texture holding the final result.
   */
  private runPasses(
    encoder: GPUCommandEncoder,
    pingTex: GPUTexture,
    pongTex: GPUTexture
  ): GPUTexture {
    let currentInput = pingTex;
    let currentOutput = pongTex;

    for (const pass of this.passes) {
      pass.encode(encoder, currentInput.createView(), currentOutput.createView());
      const tmp = currentInput;
      currentInput = currentOutput;
      currentOutput = tmp;
    }

    // After N swaps, currentInput holds the final result
    return currentInput;
  }

  private initPass(pass: PostProcessingPass): void {
    const result = pass.init(this.device!, INTERMEDIATE_FORMAT);
    this.initializedPassNames.add(pass.name);

    if (result instanceof Promise) {
      result
        .then(() =>
          this.logger.log(`[PostProcessingChain] Pass "${pass.name}" async init complete`)
        )
        .catch((err) =>
          this.logger.warn(`[PostProcessingChain] Pass "${pass.name}" async init failed:`, err)
        );
    }
  }

  private initPendingPasses(): void {
    for (const pass of this.passes) {
      if (!this.initializedPassNames.has(pass.name)) {
        this.initPass(pass);
      }
    }
  }

  private destroyCanvasTextures(): void {
    this.pingTexture?.destroy();
    this.pingTexture = null;
    this.pongTexture?.destroy();
    this.pongTexture = null;
    this.textureWidth = 0;
    this.textureHeight = 0;
  }
}
