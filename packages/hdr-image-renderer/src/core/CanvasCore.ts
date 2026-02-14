/**
 * CanvasCore - Internal coordination layer
 *
 * Responsibilities:
 * - Service lifecycle management
 * - Dependency injection via service registry
 * - Initialization orchestration
 * - Internal event coordination
 */

import { ExportManager } from '../export';
import { ImageLoadingManager } from '../ImageLoadingManager';
import { InteractionManager } from '../interaction';
import { createLogger } from '../logger';
import { CanvasResizer, RenderSettings, WebGPURenderer } from '../render';
import { setGPUDeviceLogger } from '../render/gpu-device';
import { WebGPUReadbackService } from '../render/WebGPUReadbackService';
import type { HDRCanvasOptions } from '../types';
import { ViewportCommands, ViewportController, ViewportLayoutService } from '../viewport';
import { WebGPUUploadService } from '../WebGPUUploadService';
import type { HDRCanvasEventMap } from './EventTypes';
import { TypedEventBus } from './TypedEventBus';
import {
  type CoreConfig,
  type CoreLifecycle,
  normalizeConfig,
  type ServiceMap,
  type ZoomCommands,
} from './types';

export class CanvasCore {
  // biome-ignore lint/suspicious/noExplicitAny: Heterogeneous service storage, type-safe via ServiceMap in get/register
  private services = new Map<string, any>();
  // biome-ignore lint/suspicious/noExplicitAny: Heterogeneous factory storage, type-safe via ServiceMap in get/register
  private factories = new Map<string, () => any>();
  private config: CoreConfig;
  private _lifecycle: CoreLifecycle = 'created';
  private abortController = new AbortController();

  constructor(
    private canvas: HTMLCanvasElement,
    options: HDRCanvasOptions = {}
  ) {
    this.config = normalizeConfig(options);
    this.bootstrap();
  }

  /**
   * Current lifecycle state
   */
  get lifecycle(): CoreLifecycle {
    return this._lifecycle;
  }

  /**
   * Bootstrap all systems in dependency order
   */
  private bootstrap(): void {
    // Infrastructure layer
    this.register('eventBus', () => new TypedEventBus<HDRCanvasEventMap>());
    this.register('logger', () => createLogger(this.config.debug));

    // Rendering system
    this.register('renderer', () => {
      const logger = this.get('logger');
      setGPUDeviceLogger(logger);
      return new WebGPURenderer(this.canvas, {
        transparent: this.config.transparent,
        logger,
      });
    });

    this.register('settings', () => {
      return new RenderSettings(
        {
          exposure: this.config.renderOptions.exposure,
          toneMapping: this.config.renderOptions.toneMapping,
          hdrMode: this.config.renderOptions.hdrMode,
          colorSpace: this.config.renderOptions.colorSpace,
          visualizationMode: this.config.renderOptions.visualizationMode,
          objectFit: this.config.renderOptions.objectFit,
          debug: this.config.debug,
        },
        () => this.handleRenderRequest(),
        this.get('eventBus')
      );
    });

    // Viewport system
    this.register('viewport', () => {
      const eventBus = this.get('eventBus');
      const controller = new ViewportController({}, eventBus);

      // Subscribe to viewport updates for internal re-rendering
      eventBus.on('viewport:update', () => this.handleRenderRequest());

      return controller;
    });

    this.register('layoutService', () => new ViewportLayoutService());

    this.register('commands', () => {
      return new ViewportCommands(
        this.get('viewport'),
        () => this.get('renderer').getImageDimensions(),
        () => this.getCanvasSize(),
        () => this.get('settings').getState().objectFit,
        this.get('layoutService')
      );
    });

    // Input system
    this.register('interactions', () => {
      return new InteractionManager(this.canvas, this.get('viewport'), () =>
        this.getZoomCommands()
      );
    });

    // Resource system
    this.register('resizer', () => {
      return new CanvasResizer(this.canvas, () => this.handleRenderRequest(), this.get('eventBus'));
    });

    this.register('uploadService', () => {
      return new WebGPUUploadService(this.get('renderer'));
    });

    this.register('readbackService', () => {
      return new WebGPUReadbackService(this.get('renderer'));
    });

    this.register('loading', () => {
      return new ImageLoadingManager(this.get('uploadService'), this.get('eventBus'));
    });

    this.register('export', () => {
      return new ExportManager(this.get('readbackService'), () => this.get('settings').getState());
    });
  }

  /**
   * Register service with lazy initialization (type-safe via ServiceMap)
   */
  register<K extends keyof ServiceMap>(name: K, factory: () => ServiceMap[K]): void {
    if (this.factories.has(name) || this.services.has(name)) {
      throw new Error(`Service "${name}" is already registered`);
    }
    this.factories.set(name, factory);
  }

  /**
   * Get service instance (lazy initialization on first access, type-safe via ServiceMap)
   */
  get<K extends keyof ServiceMap>(name: K): ServiceMap[K] {
    // If aborted, return no-op to prevent crashes from cleanup code
    if (this.abortController.signal.aborted) {
      return {} as ServiceMap[K];
    }

    // Return cached instance if exists
    if (this.services.has(name)) {
      return this.services.get(name) as ServiceMap[K];
    }

    // Create new instance from factory
    const factory = this.factories.get(name);
    if (!factory) {
      const registeredFactories = Array.from(this.factories.keys());
      const initializedServices = Array.from(this.services.keys());
      throw new Error(
        `[CanvasCore] Service "${name}" is not registered.\n` +
          `Available factories: [${registeredFactories.join(', ')}]\n` +
          `Initialized services: [${initializedServices.join(', ')}]`
      );
    }

    const instance = factory();
    this.services.set(name, instance);
    this.factories.delete(name); // Factory no longer needed
    return instance as ServiceMap[K];
  }

  /**
   * Check if service exists (without triggering initialization)
   */
  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * Initialize WebGPU context
   */
  async initialize(): Promise<void> {
    if (this._lifecycle !== 'created') {
      return;
    }

    this._lifecycle = 'initializing';
    await this.get('renderer').initialize();
    this._lifecycle = 'ready';
  }

  /**
   * Handle render request from subsystems
   */
  private handleRenderRequest(): void {
    if (this._lifecycle !== 'ready') return;

    const renderer = this.get('renderer');
    const settings = this.get('settings');
    const viewport = this.get('viewport');

    renderer.render({
      ...settings.getState(),
      viewport: viewport.getState(),
    });

    // Emit event for subscribers
    this.emit('render:complete', {});
  }

  /**
   * Emit internal event
   */
  private emit<K extends keyof HDRCanvasEventMap>(event: K, data: HDRCanvasEventMap[K]): void {
    this.get('eventBus').emit(event, data);
  }

  /**
   * Get EventBus for event subscriptions
   */
  getEventBus(): TypedEventBus<HDRCanvasEventMap> {
    return this.get('eventBus');
  }

  /**
   * Get canvas size
   */
  private getCanvasSize(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /**
   * Get zoom command handlers
   */
  private getZoomCommands(): ZoomCommands {
    const commands = this.get('commands');
    return {
      zoomIn: (factor?: number) => commands.zoomIn(factor),
      zoomOut: (factor?: number) => commands.zoomOut(factor),
      zoomToFit: () => commands.zoomToFit(),
      zoomToActual: () => commands.zoomToActual(),
    };
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    if (this._lifecycle === 'destroyed') {
      return;
    }

    // Abort all async operations FIRST
    this.abortController.abort();

    // Mark as destroyed to prevent new service access
    this._lifecycle = 'destroyed';

    // Destroy services in reverse dependency order
    const destroyOrder = [
      'loading',
      'export',
      'readbackService',
      'uploadService',
      'resizer',
      'interactions',
      'commands',
      'layoutService',
      'viewport',
      'settings',
      'renderer',
      'eventBus',
      'logger',
    ];

    for (const name of destroyOrder) {
      const service = this.services.get(name);
      if (service && typeof service.destroy === 'function') {
        try {
          service.destroy();
        } catch (error) {
          if (this.config.debug) {
            console.error(`[CanvasCore] Error destroying service "${name}":`, error);
          }
        }
      }
    }

    this.services.clear();
    this.factories.clear();
  }
}
