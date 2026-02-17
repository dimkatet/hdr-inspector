/**
 * HDRCanvas - Main API (Facade)
 *
 * High-level interface for rendering HDR images with WebGPU.
 * Delegates lifecycle to CanvasRuntime and service access to ServiceRegistry.
 *
 * Architecture:
 *   HDRCanvas (Facade) → CanvasRuntime (Orchestration) → ServiceRegistry (DI) → Services
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
    const registry =this.runtime.registry;

    // Initialize API namespaces AFTER runtime is created
    // This ensures arrow functions capture the correct core instance during HMR
    this.viewport = {
      // State
      getState: () => registry.get('viewport').getState(),
      setConfig: (config) => registry.get('viewport').updateConfig(config),

      // Commands (instant)
      setZoom: (zoom) => registry.get('commands').setZoom(zoom),
      setPan: (x, y) => registry.get('commands').setPan(x, y),
      setViewport: (viewport) => registry.get('commands').setViewport(viewport),

      // Commands (animated)
      zoomIn: (factor) => registry.get('commands').zoomIn(factor),
      zoomOut: (factor) => registry.get('commands').zoomOut(factor),
      zoomToFit: () => registry.get('commands').zoomToFit(),
      zoomToActual: () => registry.get('commands').zoomToActual(),
      reset: (animated) => registry.get('commands').reset(animated),
    };

    this.render = {
      getState: () => registry.get('settings').getState(),
      setExposure: (ev) => registry.get('settings').setExposure(ev),
      setToneMapping: (operator) => registry.get('settings').setToneMapping(operator),
      setHDRMode: (enabled) => registry.get('settings').setHDRMode(enabled),
      setColorSpace: (space) => registry.get('settings').setColorSpace(space),
      setVisualizationMode: (mode) => registry.get('settings').setVisualizationMode(mode),
      setObjectFit: (mode) => registry.get('settings').setObjectFit(mode),
      updateOptions: (options) => registry.get('settings').updateOptions(options),
    };

    this.interaction = {
      attach: (options) => registry.get('interactions').attach(options),
      detach: () => registry.get('interactions').detach(),
    };

    this.control = {
      enableAutoResize: () => registry.get('resizer').enable(),
      disableAutoResize: () => registry.get('resizer').disable(),
      getImageDimensions: () => registry.get('renderer').getImageDimensions(),
      getImageInfo: () => {
        const dims = registry.get('renderer').getImageDimensions();
        return {
          width: dims.width,
          height: dims.height,
          aspectRatio: dims.width / dims.height,
        };
      },
      forceRender: () => this.runtime.requestRender(),
    };

    this.export = {
      toBlob: (options) => registry.get('export').toBlob(options),
    };

    this.loading = {
      upload: (data) => registry.get('loading').upload(data),
      load: (loader, options) => registry.get('loading').load(loader, options),
      cancel: () => registry.get('loading').cancel(),
      getState: () => registry.get('loading').getState(),
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
