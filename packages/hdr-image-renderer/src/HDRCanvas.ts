/**
 * HDRCanvas - Main API (Facade)
 *
 * High-level interface for rendering HDR images with WebGPU.
 * Delegates lifecycle to CanvasRuntime and service access to CanvasCore.
 *
 * Architecture:
 *   HDRCanvas (Facade) → CanvasRuntime (Lifecycle) → CanvasCore (DI) → Services
 */

import { CanvasRuntime } from './core/CanvasRuntime';
import type { HDRCanvasEventMap } from './core/EventTypes';
import type { EventBusOptions } from './core/TypedEventBus';
import type {
  CanvasAPI,
  ExportAPI,
  HDRCanvasOptions,
  IHDRCanvas,
  InteractionAPI,
  LoadingAPI,
  RenderAPI,
  ViewportAPI,
} from './types';

export class HDRCanvas implements IHDRCanvas {
  private runtime: CanvasRuntime;

  // ============================================================
  // Namespaced API
  // ============================================================

  /**
   * Viewport control API
   * Manages zoom, pan, and viewport state
   */
  readonly viewport: ViewportAPI;

  /**
   * Render settings API
   * Controls exposure, tone mapping, and visualization
   */
  readonly render: RenderAPI;

  /**
   * Interaction management API
   * Handles mouse, touch, and keyboard interactions
   */
  readonly interaction: InteractionAPI;

  /**
   * Canvas control API
   * Canvas-specific operations (auto-resize, image info, etc.)
   */
  readonly control: CanvasAPI;

  /**
   * Image export API
   * Export rendered image as Blob (PNG/JPEG by default, custom via callback)
   */
  readonly export: ExportAPI;

  /**
   * Image loading API
   * Manages async image loading with placeholder and error fallback support
   */
  readonly loading: LoadingAPI;

  constructor(canvas: HTMLCanvasElement, options: HDRCanvasOptions = {}) {
    this.runtime = new CanvasRuntime(canvas, options);
    const core = this.runtime.core;

    // Initialize API namespaces AFTER runtime is created
    // This ensures arrow functions capture the correct core instance during HMR
    this.viewport = {
      // State
      getState: () => core.get('viewport').getState(),
      setConfig: (config) => core.get('viewport').updateConfig(config),

      // Commands (instant)
      setZoom: (zoom) => core.get('commands').setZoom(zoom),
      setPan: (x, y) => core.get('commands').setPan(x, y),
      setViewport: (viewport) => core.get('commands').setViewport(viewport),

      // Commands (animated)
      zoomIn: (factor) => core.get('commands').zoomIn(factor),
      zoomOut: (factor) => core.get('commands').zoomOut(factor),
      zoomToFit: () => core.get('commands').zoomToFit(),
      zoomToActual: () => core.get('commands').zoomToActual(),
      reset: (animated) => core.get('commands').reset(animated),
    };

    this.render = {
      getState: () => core.get('settings').getState(),
      setExposure: (ev) => core.get('settings').setExposure(ev),
      setToneMapping: (operator) => core.get('settings').setToneMapping(operator),
      setHDRMode: (enabled) => core.get('settings').setHDRMode(enabled),
      setColorSpace: (space) => core.get('settings').setColorSpace(space),
      setVisualizationMode: (mode) => core.get('settings').setVisualizationMode(mode),
      setObjectFit: (mode) => core.get('settings').setObjectFit(mode),
      updateOptions: (options) => core.get('settings').updateOptions(options),
    };

    this.interaction = {
      attach: (options) => core.get('interactions').attach(options),
      detach: () => core.get('interactions').detach(),
    };

    this.control = {
      enableAutoResize: () => core.get('resizer').enable(),
      disableAutoResize: () => core.get('resizer').disable(),
      getImageDimensions: () => core.get('renderer').getImageDimensions(),
      getImageInfo: () => {
        const dims = core.get('renderer').getImageDimensions();
        return {
          width: dims.width,
          height: dims.height,
          aspectRatio: dims.width / dims.height,
        };
      },
      forceRender: () => this.runtime.requestRender(),
    };

    this.export = {
      toBlob: (options) => core.get('export').toBlob(options),
    };

    this.loading = {
      upload: (data) => core.get('loading').upload(data),
      load: (loader, options) => core.get('loading').load(loader, options),
      cancel: () => core.get('loading').cancel(),
      getState: () => core.get('loading').getState(),
    };
  }

  // ============================================================
  // Event Subscription (Unified API)
  // ============================================================

  /**
   * Subscribe to canvas events (unified event API)
   *
   * @param event - Event name (type-safe)
   * @param callback - Event callback (data type inferred from event)
   * @param options - Optional throttle configuration
   * @returns Unsubscribe function
   */
  on<K extends keyof HDRCanvasEventMap>(
    event: K,
    callback: (data: HDRCanvasEventMap[K]) => void,
    options?: EventBusOptions
  ): () => void {
    return this.runtime.getEventBus().on(event, callback, options);
  }

  // ============================================================
  // Initialization & Cleanup
  // ============================================================

  /**
   * Initialize rendering context (must be called before loading images)
   */
  async initialize(): Promise<void> {
    await this.runtime.start();
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    // stop() is async but we fire-and-forget for backward compatibility
    // (destroy() was always sync in the old API)
    void this.runtime.stop();
  }
}
