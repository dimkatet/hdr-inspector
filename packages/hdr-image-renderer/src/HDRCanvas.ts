/**
 * HDRCanvas - Main API (Facade)
 *
 * High-level interface for rendering HDR images with WebGPU.
 * Delegates to CanvasCore for coordination and lifecycle management.
 *
 * All service access uses typed ServiceMap — no concrete class imports needed.
 */

import { CanvasCore } from './core';
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
  private core: CanvasCore;

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
    this.core = new CanvasCore(canvas, options);

    // Initialize API namespaces AFTER core is created
    // This ensures arrow functions capture the correct core instance during HMR
    this.viewport = {
      // State
      getState: () => this.core.get('viewport').getState(),
      setConfig: (config) => this.core.get('viewport').updateConfig(config),

      // Commands (instant)
      setZoom: (zoom) => this.core.get('commands').setZoom(zoom),
      setPan: (x, y) => this.core.get('commands').setPan(x, y),
      setViewport: (viewport) => this.core.get('commands').setViewport(viewport),

      // Commands (animated)
      zoomIn: (factor) => this.core.get('commands').zoomIn(factor),
      zoomOut: (factor) => this.core.get('commands').zoomOut(factor),
      zoomToFit: () => this.core.get('commands').zoomToFit(),
      zoomToActual: () => this.core.get('commands').zoomToActual(),
      reset: (animated) => this.core.get('commands').reset(animated),
    };

    this.render = {
      getState: () => this.core.get('settings').getState(),
      setExposure: (ev) => this.core.get('settings').setExposure(ev),
      setToneMapping: (operator) => this.core.get('settings').setToneMapping(operator),
      setHDRMode: (enabled) => this.core.get('settings').setHDRMode(enabled),
      setColorSpace: (space) => this.core.get('settings').setColorSpace(space),
      setVisualizationMode: (mode) => this.core.get('settings').setVisualizationMode(mode),
      setObjectFit: (mode) => this.core.get('settings').setObjectFit(mode),
      updateOptions: (options) => this.core.get('settings').updateOptions(options),
    };

    this.interaction = {
      attach: (options) => this.core.get('interactions').attach(options),
      detach: () => this.core.get('interactions').detach(),
    };

    this.control = {
      enableAutoResize: () => this.core.get('resizer').enable(),
      disableAutoResize: () => this.core.get('resizer').disable(),
      getImageDimensions: () => this.core.get('renderer').getImageDimensions(),
      getImageInfo: () => {
        const dims = this.core.get('renderer').getImageDimensions();
        return {
          width: dims.width,
          height: dims.height,
          aspectRatio: dims.width / dims.height,
        };
      },
      forceRender: () => {
        if (this.core.lifecycle === 'ready') {
          this.core.get('renderer').render({
            ...this.core.get('settings').getState(),
            viewport: this.core.get('viewport').getState(),
          });
        }
      },
    };

    this.export = {
      toBlob: (options) => this.core.get('export').toBlob(options),
    };

    this.loading = {
      upload: (data) => this.core.get('loading').upload(data),
      load: (loader, options) => this.core.get('loading').load(loader, options),
      cancel: () => this.core.get('loading').cancel(),
      getState: () => this.core.get('loading').getState(),
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
   *
   * @example
   * // Viewport events
   * canvas.on('viewport:mutation', (data) => {
   *   if (data.mutation.type === 'zoom') {
   *     console.log('Zoom:', data.mutation.zoom);
   *   }
   * });
   *
   * // Loading events
   * canvas.on('loading:stateChange', (data) => {
   *   console.log('State:', data.state);
   * }, { throttle: 100 });
   */
  on<K extends keyof HDRCanvasEventMap>(
    event: K,
    callback: (data: HDRCanvasEventMap[K]) => void,
    options?: EventBusOptions
  ): () => void {
    return this.core.getEventBus().on(event, callback, options);
  }

  // ============================================================
  // Initialization & Loading
  // ============================================================

  /**
   * Initialize WebGPU context (must be called before loading images)
   */
  async initialize(): Promise<void> {
    await this.core.initialize();
  }

  // ============================================================
  // Cleanup
  // ============================================================

  /**
   * Cleanup GPU resources
   */
  destroy(): void {
    this.core.destroy();
  }
}
