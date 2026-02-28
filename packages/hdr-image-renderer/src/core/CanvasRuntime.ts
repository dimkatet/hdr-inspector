/**
 * CanvasRuntime - Lifecycle orchestration layer
 *
 * Single point of control for:
 * - Service bootstrap and registration
 * - Start / stop lifecycle (delegated to RuntimeKernel)
 * - Error boundary (rollback on init failure)
 * - Render coordination
 *
 * Architecture:
 *   HDRCanvas (Facade)
 *     → CanvasRuntime (Orchestration)
 *       → RuntimeKernel (State machine + AbortSignal)
 *       → ServiceRegistry (DI container + managed tracking)
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
import { ServiceRegistry } from './CanvasCore';
import { resolveConfig } from './ConfigResolver';
import type { DomainEventMap, HDRCanvasEventMap, RuntimeEventMap } from './EventTypes';
import type { HDRPlugin } from './Plugin';
import { PluginManager } from './PluginManager';
import { RuntimeKernel } from './RuntimeKernel';
import type { RuntimeContext, RuntimeService } from './RuntimeService';
import { TypedEventBus } from './TypedEventBus';
import type { CoreConfig } from './types';

export class CanvasRuntime {
  private kernel = new RuntimeKernel();
  // config is assigned once in resolveConfig() before any service factory runs
  private config!: CoreConfig;
  private readonly rawOptions: HDRCanvasOptions;
  private logger: Logger;
  private pluginManager: PluginManager;

  readonly registry: ServiceRegistry;

  constructor(
    private canvas: HTMLCanvasElement,
    options: HDRCanvasOptions = {}
  ) {
    this.rawOptions = options;
    this.logger = createLogger(options.debug ?? false);
    this.pluginManager = new PluginManager(this.logger);
    this.registry = new ServiceRegistry();
    this.bootstrap();
  }

  /**
   * Register a plugin.
   *
   * Can be called before or after `initialize()`.
   * If the runtime is already running, the plugin is installed immediately.
   */
  addPlugin(plugin: HDRPlugin): void {
    this.pluginManager.add(plugin);
  }

  /**
   * Current runtime state
   */
  get state() {
    return this.kernel.state;
  }

  /**
   * Start runtime: initialize → start all managed services
   *
   * Flow: idle → initializing → running
   * On error: rollback initialized services → error
   */
  async start(): Promise<void> {
    if (!this.kernel.prepareStart()) return;

    await this.resolveConfig();

    // Force lazy instantiation of managed services (factories populate managedInstances)
    for (const key of this.registry.getManagedKeys()) {
      this.registry.get(key);
    }

    const ctx = this.createContext();
    const instances = this.registry.getManagedInstances();
    const initialized: RuntimeService[] = [];

    try {
      for (const { name, service } of instances) {
        this.logger.log(`[CanvasRuntime] Initializing ${name}`);
        await service.init(ctx);
        initialized.push(service);
      }

      for (const { name, service } of instances) {
        this.logger.log(`[CanvasRuntime] Starting ${name}`);
        service.start();
      }

      this.kernel.markRunning();
      await this.pluginManager.installAll(this.createPluginContext());
    } catch (error) {
      this.logger.warn('[CanvasRuntime] Init failed, rolling back:', error);
      this.rollback(initialized);
      this.kernel.markError();
      throw error;
    }
  }

  /**
   * Stop runtime: stop → dispose all managed services (reverse order)
   *
   * Flow: running → stopping → stopped
   */
  async stop(): Promise<void> {
    if (!this.kernel.prepareStop()) return;

    // Uninstall plugins before stopping services
    await this.pluginManager.uninstallAll();

    // Stop and dispose in reverse order
    const instances = this.registry.getManagedInstances();
    for (let i = instances.length - 1; i >= 0; i--) {
      const { name, service } = instances[i];
      try {
        this.logger.log(`[CanvasRuntime] Stopping ${name}`);
        service.stop();
        service.dispose();
      } catch (error) {
        this.logger.warn(`[CanvasRuntime] Error stopping ${name}:`, error);
      }
    }

    // Clear DI registry
    this.registry.clear();

    this.kernel.markStopped();
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
    if (this.kernel.state !== 'running') return;

    const eventBus = this.registry.get('eventBus');
    const renderer = this.registry.get('renderer');
    const settings = this.registry.get('settings');
    const viewport = this.registry.get('viewport');

    eventBus.emit('render:beforeFrame', {});

    renderer.render({
      ...settings.getState(),
      viewport: viewport.getState(),
    });

    eventBus.emit('render:complete', {});
  }

  private compositeEventBus: TypedEventBus<HDRCanvasEventMap> | null = null;

  /**
   * Get composite EventBus for unified event subscriptions.
   * Routes domain events to domainBus, runtime events to runtimeBus.
   */
  getEventBus(): TypedEventBus<HDRCanvasEventMap> {
    if (!this.compositeEventBus) {
      this.compositeEventBus = this.createCompositeEventBus();
    }
    return this.compositeEventBus;
  }

  // ============================================================
  // Private
  // ============================================================

  /**
   * Register all services in ServiceRegistry and track managed ones
   */
  private bootstrap(): void {
    // Infrastructure (pure services — no RuntimeService)
    this.registry.register('eventBus', () => new TypedEventBus<DomainEventMap>());
    this.registry.register('runtimeEventBus', () => {
      const bus = new TypedEventBus<RuntimeEventMap>();
      this.kernel.setEventBus(bus);
      return bus;
    });
    this.registry.register('logger', () => this.logger);

    // Reset composite event bus (will be recreated on next getEventBus() call)
    this.compositeEventBus = null;

    // Renderer (managed) — use custom backend if provided, otherwise default to WebGPU
    this.registry.registerManaged('renderer', () => {
      const renderer = this.config.renderer ?? (() => {
        setGPUDeviceLogger(this.logger);
        return new WebGPURenderer(this.canvas, {
          transparent: this.config.transparent,
          logger: this.logger,
        });
      })();
      this.registry.trackManagedInstance('renderer', renderer);
      return renderer;
    });

    // Settings (pure)
    this.registry.register('settings', () => {
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
        this.registry.get('eventBus')
      );
    });

    // Viewport (managed)
    this.registry.registerManaged('viewport', () => {
      const eventBus = this.registry.get('eventBus');
      const controller = new ViewportController({}, eventBus, this.logger);

      // Subscribe to viewport updates for re-rendering
      eventBus.on('viewport:update', () => this.requestRender());

      this.registry.trackManagedInstance('viewport', controller);
      return controller;
    });

    // Layout (pure)
    this.registry.register('layoutService', () => new ViewportLayoutService());

    // Commands (pure)
    this.registry.register('commands', () => {
      return new ViewportCommands(
        this.registry.get('viewport'),
        () => this.registry.get('renderer').getImageDimensions(),
        () => this.getCanvasSize(),
        () => this.registry.get('settings').getState().objectFit,
        this.registry.get('layoutService'),
        this.logger
      );
    });

    // Interactions (managed)
    this.registry.registerManaged('interactions', () => {
      const manager = new InteractionManager(
        this.canvas,
        this.registry.get('viewport'),
        () => this.getZoomCommands(),
        this.logger
      );
      this.registry.trackManagedInstance('interactions', manager);
      return manager;
    });

    // Resizer (managed)
    this.registry.registerManaged('resizer', () => {
      const resizer = new CanvasResizer(
        this.canvas,
        () => this.requestRender(),
        this.registry.get('eventBus')
      );
      this.registry.trackManagedInstance('resizer', resizer);
      return resizer;
    });

    // Upload (pure — wraps renderer)
    this.registry.register('uploadService', () => {
      return new WebGPUUploadService(this.registry.get('renderer'));
    });

    // Readback (pure — wraps renderer)
    this.registry.register('readbackService', () => {
      return new WebGPUReadbackService(this.registry.get('renderer'));
    });

    // Loading (managed)
    this.registry.registerManaged('loading', () => {
      const eventBus = this.registry.get('eventBus');
      const manager = new ImageLoadingManager(
        this.registry.get('uploadService'),
        eventBus
      );

      // Re-render after image upload completes
      eventBus.on('loading:stateChange', ({ state }) => {
        if (state.status === 'success') this.requestRender();
      });

      this.registry.trackManagedInstance('loading', manager);
      return manager;
    });

    // Export (pure)
    this.registry.register('export', () => {
      return new ExportManager(this.registry.get('readbackService'), () =>
        this.registry.get('settings').getState()
      );
    });
  }

  /**
   * Create RuntimeContext for service initialization
   */
  private createContext(): RuntimeContext {
    return {
      eventBus: this.registry.get('eventBus'),
      signal: this.kernel.signal,
      logger: this.logger,
      config: this.config,
    };
  }

  /**
   * Create PluginContext for plugin install
   */
  private createPluginContext(): import('./Plugin').PluginContext {
    return {
      canvas: this.canvas,
      services: this.registry,
      events: this.getEventBus(),
      logger: this.logger,
    };
  }

  /**
   * Resolve raw user options into a fully-populated CoreConfig.
   * Called once in start() before any service factory is invoked.
   * After this, this.config is guaranteed to be complete.
   */
  private async resolveConfig(): Promise<void> {
    this.config = await resolveConfig(this.rawOptions);
    this.logger.log(`[CanvasRuntime] config resolved: hdrMode=${this.config.renderOptions.hdrMode} colorSpace=${this.config.renderOptions.colorSpace} toneMapping=${this.config.renderOptions.toneMapping}`);
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
    const commands = this.registry.get('commands');
    return {
      zoomIn: (factor?: number) => commands.zoomIn(factor),
      zoomOut: (factor?: number) => commands.zoomOut(factor),
      zoomToFit: () => commands.zoomToFit(),
      zoomToActual: () => commands.zoomToActual(),
    };
  }

  /**
   * Create a composite EventBus that routes events to the correct internal bus.
   * Domain events → domainBus, runtime events → runtimeBus.
   */
  private createCompositeEventBus(): TypedEventBus<HDRCanvasEventMap> {
    const domainBus = this.registry.get('eventBus');
    const runtimeBus = this.registry.get('runtimeEventBus');

    const isRuntimeEvent = (event: string | number | symbol): boolean =>
      typeof event === 'string' && event.startsWith('runtime:');

    // Use a real TypedEventBus as the base, then override methods to route
    const composite = new TypedEventBus<HDRCanvasEventMap>();

    const originalOn = composite.on.bind(composite);
    composite.on = (<K extends keyof HDRCanvasEventMap>(
      event: K,
      callback: (data: HDRCanvasEventMap[K]) => void,
      options?: import('./TypedEventBus').EventBusOptions
    ) => {
      if (isRuntimeEvent(event)) {
        // biome-ignore lint/suspicious/noExplicitAny: Bridge between typed buses requires type erasure
        return runtimeBus.on(event as any, callback as any, options);
      }
      // biome-ignore lint/suspicious/noExplicitAny: Bridge between typed buses requires type erasure
      return domainBus.on(event as any, callback as any, options);
    }) as typeof originalOn;

    const originalEmit = composite.emit.bind(composite);
    composite.emit = (<K extends keyof HDRCanvasEventMap>(event: K, data: HDRCanvasEventMap[K]) => {
      if (isRuntimeEvent(event)) {
        // biome-ignore lint/suspicious/noExplicitAny: Bridge between typed buses requires type erasure
        runtimeBus.emit(event as any, data as any);
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: Bridge between typed buses requires type erasure
        domainBus.emit(event as any, data as any);
      }
    }) as typeof originalEmit;

    const originalOff = composite.off.bind(composite);
    composite.off = (<K extends keyof HDRCanvasEventMap>(event: K) => {
      if (isRuntimeEvent(event)) {
        // biome-ignore lint/suspicious/noExplicitAny: Bridge between typed buses requires type erasure
        runtimeBus.off(event as any);
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: Bridge between typed buses requires type erasure
        domainBus.off(event as any);
      }
    }) as typeof originalOff;

    composite.clear = () => {
      domainBus.clear();
      runtimeBus.clear();
    };

    return composite;
  }
}
