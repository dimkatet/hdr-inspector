/**
 * CanvasRuntime - Lifecycle orchestration layer
 *
 * Single point of control for:
 * - Service initialization order
 * - Start / stop lifecycle
 * - Centralized AbortController
 * - Error boundary (rollback on init failure)
 * - Render coordination
 *
 * Architecture:
 *   HDRCanvas (Facade)
 *     → CanvasRuntime (Lifecycle / Orchestration)
 *       → CanvasCore (DI / Registry)
 *         → Services
 */

import { ExportManager } from '../export';
import { ImageLoadingManager } from '../ImageLoadingManager';
import { InteractionManager } from '../interaction';
import { createLogger, type Logger } from '../logger';
import { CanvasResizer, RenderSettings, WebGPURenderer } from '../render';
import { setGPUDeviceLogger } from '../render/gpu-device';
import { WebGPUReadbackService } from '../render/WebGPUReadbackService';
import type { HDRCanvasOptions } from '../types';
import { ViewportCommands, ViewportController, ViewportLayoutService } from '../viewport';
import { WebGPUUploadService } from '../WebGPUUploadService';
import { CanvasCore } from './CanvasCore';
import type { HDRCanvasEventMap } from './EventTypes';
import type { RuntimeContext, RuntimeService, RuntimeState } from './RuntimeService';
import { TypedEventBus } from './TypedEventBus';
import { type CoreConfig, normalizeConfig } from './types';

export class CanvasRuntime {
  private _state: RuntimeState = 'idle';
  private managedServices: Array<{ name: string; service: RuntimeService }> = [];
  /** Keys of managed services in bootstrap order — used to force lazy instantiation before init */
  private managedServiceKeys: Array<keyof import('./types').ServiceMap> = [];
  private abortController = new AbortController();
  private config: CoreConfig;
  private logger: Logger;

  readonly core: CanvasCore;

  constructor(
    private canvas: HTMLCanvasElement,
    options: HDRCanvasOptions = {}
  ) {
    this.config = normalizeConfig(options);
    this.logger = createLogger(this.config.debug);
    this.core = new CanvasCore();
    this.bootstrap();
  }

  /**
   * Current runtime state
   */
  get state(): RuntimeState {
    return this._state;
  }

  /**
   * Start runtime: initialize → start all managed services
   *
   * Flow: idle → initializing → running
   * On error: rollback initialized services → error
   */
  async start(): Promise<void> {
    if (this._state !== 'idle' && this._state !== 'stopped') {
      return;
    }

    this.transitionTo('initializing');

    // Create fresh abort controller for this lifecycle
    this.abortController = new AbortController();

    // Force lazy instantiation of managed services (factories populate managedServices array)
    for (const key of this.managedServiceKeys) {
      this.core.get(key);
    }

    const ctx = this.createContext();
    const initialized: RuntimeService[] = [];

    try {
      for (const { name, service } of this.managedServices) {
        this.logger.log(`[CanvasRuntime] Initializing ${name}`);
        await service.init(ctx);
        initialized.push(service);
      }

      for (const { name, service } of this.managedServices) {
        this.logger.log(`[CanvasRuntime] Starting ${name}`);
        service.start();
      }

      this.transitionTo('running');
    } catch (error) {
      this.logger.warn('[CanvasRuntime] Init failed, rolling back:', error);
      this.rollback(initialized);
      this.transitionTo('error');
      throw error;
    }
  }

  /**
   * Stop runtime: stop → dispose all managed services (reverse order)
   *
   * Flow: running → stopping → stopped
   */
  async stop(): Promise<void> {
    if (this._state === 'stopped' || this._state === 'idle') {
      return;
    }

    this.transitionTo('stopping');

    // Abort any async operations
    this.abortController.abort();

    // Stop and dispose in reverse order
    for (let i = this.managedServices.length - 1; i >= 0; i--) {
      const { name, service } = this.managedServices[i];
      try {
        this.logger.log(`[CanvasRuntime] Stopping ${name}`);
        service.stop();
        service.dispose();
      } catch (error) {
        this.logger.warn(`[CanvasRuntime] Error stopping ${name}:`, error);
      }
    }

    // Clear DI registry
    this.core.clear();

    this.transitionTo('stopped');
  }

  /**
   * Restart runtime (stop + start)
   */
  async restart(): Promise<void> {
    await this.stop();
    // Re-bootstrap services after stop cleared them
    this.bootstrap();
    await this.start();
  }

  /**
   * Request a render (coordinates settings + viewport + renderer)
   */
  requestRender(): void {
    if (this._state !== 'running') return;

    const renderer = this.core.get('renderer');
    const settings = this.core.get('settings');
    const viewport = this.core.get('viewport');

    renderer.render({
      ...settings.getState(),
      viewport: viewport.getState(),
    });

    this.core.get('eventBus').emit('render:complete', {});
  }

  /**
   * Get EventBus for event subscriptions
   */
  getEventBus(): TypedEventBus<HDRCanvasEventMap> {
    return this.core.get('eventBus');
  }

  // ============================================================
  // Private
  // ============================================================

  /**
   * Register all services in CanvasCore and track managed ones
   */
  private bootstrap(): void {
    this.managedServices = [];
    this.managedServiceKeys = [];

    // Infrastructure (pure services — no RuntimeService)
    this.core.register('eventBus', () => new TypedEventBus<HDRCanvasEventMap>());
    this.core.register('logger', () => this.logger);

    // Renderer (managed)
    this.core.register('renderer', () => {
      setGPUDeviceLogger(this.logger);
      const renderer = new WebGPURenderer(this.canvas, {
        transparent: this.config.transparent,
        logger: this.logger,
      });
      this.registerManaged('renderer', renderer);
      return renderer;
    });
    this.managedServiceKeys.push('renderer');

    // Settings (pure)
    this.core.register('settings', () => {
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
        () => this.requestRender(),
        this.core.get('eventBus')
      );
    });

    // Viewport (managed)
    this.core.register('viewport', () => {
      const eventBus = this.core.get('eventBus');
      const controller = new ViewportController({}, eventBus, this.logger);

      // Subscribe to viewport updates for re-rendering
      eventBus.on('viewport:update', () => this.requestRender());

      this.registerManaged('viewport', controller);
      return controller;
    });
    this.managedServiceKeys.push('viewport');

    // Layout (pure)
    this.core.register('layoutService', () => new ViewportLayoutService());

    // Commands (pure)
    this.core.register('commands', () => {
      return new ViewportCommands(
        this.core.get('viewport'),
        () => this.core.get('renderer').getImageDimensions(),
        () => this.getCanvasSize(),
        () => this.core.get('settings').getState().objectFit,
        this.core.get('layoutService'),
        this.logger
      );
    });

    // Interactions (managed)
    this.core.register('interactions', () => {
      const manager = new InteractionManager(
        this.canvas,
        this.core.get('viewport'),
        () => this.getZoomCommands(),
        this.logger
      );
      this.registerManaged('interactions', manager);
      return manager;
    });
    this.managedServiceKeys.push('interactions');

    // Resizer (managed)
    this.core.register('resizer', () => {
      const resizer = new CanvasResizer(
        this.canvas,
        () => this.requestRender(),
        this.core.get('eventBus')
      );
      this.registerManaged('resizer', resizer);
      return resizer;
    });
    this.managedServiceKeys.push('resizer');

    // Upload (pure — wraps renderer)
    this.core.register('uploadService', () => {
      return new WebGPUUploadService(this.core.get('renderer'));
    });

    // Readback (pure — wraps renderer)
    this.core.register('readbackService', () => {
      return new WebGPUReadbackService(this.core.get('renderer'));
    });

    // Loading (managed)
    this.core.register('loading', () => {
      const eventBus = this.core.get('eventBus');
      const manager = new ImageLoadingManager(
        this.core.get('uploadService'),
        eventBus
      );

      // Re-render after image upload completes
      eventBus.on('loading:stateChange', ({ state }) => {
        if (state.status === 'success') this.requestRender();
      });

      this.registerManaged('loading', manager);
      return manager;
    });
    this.managedServiceKeys.push('loading');

    // Export (pure)
    this.core.register('export', () => {
      return new ExportManager(this.core.get('readbackService'), () =>
        this.core.get('settings').getState()
      );
    });
  }

  /**
   * Track a service as managed (will receive lifecycle calls)
   */
  private registerManaged(name: string, service: RuntimeService): void {
    this.managedServices.push({ name, service });
  }

  /**
   * Create RuntimeContext for service initialization
   */
  private createContext(): RuntimeContext {
    return {
      eventBus: this.core.get('eventBus'),
      signal: this.abortController.signal,
      logger: this.logger,
      config: this.config,
    };
  }

  /**
   * Transition to a new state and emit event
   */
  private transitionTo(newState: RuntimeState): void {
    const previousState = this._state;
    this._state = newState;

    // Emit event if eventBus is available (may not be during early init)
    if (this.core.has('eventBus')) {
      try {
        this.core.get('eventBus').emit('runtime:stateChange', {
          state: newState,
          previousState,
        });
      } catch {
        // EventBus may be cleared during stop — ignore
      }
    }
  }

  /**
   * Rollback already-initialized services on error (reverse order)
   */
  private rollback(initialized: RuntimeService[]): void {
    for (let i = initialized.length - 1; i >= 0; i--) {
      try {
        initialized[i].stop();
        initialized[i].dispose();
      } catch (error) {
        this.logger.warn('[CanvasRuntime] Error during rollback:', error);
      }
    }
  }

  /**
   * Get canvas CSS size
   */
  private getCanvasSize(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /**
   * Get zoom command handlers for interaction system
   */
  private getZoomCommands() {
    const commands = this.core.get('commands');
    return {
      zoomIn: (factor?: number) => commands.zoomIn(factor),
      zoomOut: (factor?: number) => commands.zoomOut(factor),
      zoomToFit: () => commands.zoomToFit(),
      zoomToActual: () => commands.zoomToActual(),
    };
  }
}
