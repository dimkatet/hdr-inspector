/**
 * CanvasRuntime - Lifecycle orchestration layer
 *
 * Single point of control for:
 * - Service bootstrap and registration
 * - Start / stop lifecycle (delegated to RuntimeKernel)
 * - Error boundary (rollback on init failure)
 * - Render coordination
 *
 * Bootstrap phases:
 *   constructor → bootstrapCore()     // eventBus, logger — environment-independent, survive restart
 *   start()     → bootstrapRuntime()  // renderer, settings, viewport, etc. — needs resolved config
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
import { deriveImageDefaults } from '../render/imageDefaults';
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
import type { CoreConfig, ServiceMap } from './types';

export class CanvasRuntime {
  private kernel = new RuntimeKernel();
  private readonly rawOptions: HDRCanvasOptions;
  private logger: Logger;
  private pluginManager: PluginManager;
  private compositeEventBus: TypedEventBus<HDRCanvasEventMap>;

  readonly registry: ServiceRegistry;

  /**
   * Core service keys that survive restart.
   * These are environment-independent and bootstrapped once in the constructor.
   */
  private static readonly CORE_KEYS: ReadonlyArray<keyof ServiceMap> = [
    'eventBus',
    'runtimeEventBus',
    'logger',
  ];

  constructor(
    private canvas: HTMLCanvasElement,
    options: HDRCanvasOptions = {}
  ) {
    this.rawOptions = options;
    this.logger = createLogger(options.debug ?? false);
    this.pluginManager = new PluginManager(this.logger);
    this.registry = new ServiceRegistry();
    this.bootstrapCore();
    this.compositeEventBus = this.createCompositeEventBus();
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
   * Start runtime: resolve config → bootstrap runtime services → initialize → start
   *
   * Flow: idle → initializing → running
   * On error: rollback initialized services → error
   */
  async start(): Promise<void> {
    if (!this.kernel.prepareStart()) return;

    const config = await this.resolveConfig();
    this.bootstrapRuntime(config);

    // Force lazy instantiation of managed services (factories populate managedInstances)
    for (const key of this.registry.getManagedKeys()) {
      this.registry.get(key);
    }

    const ctx = this.createContext(config);
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
   * Stop runtime: stop → dispose all managed services (reverse order).
   * Core services (eventBus, logger) are preserved for restart.
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

    // Clear only runtime services — core services (eventBus, logger) survive
    this.registry.clearRuntime(CanvasRuntime.CORE_KEYS);

    this.kernel.markStopped();
  }

  /**
   * Restart runtime (stop + start).
   * Core services survive — existing event subscriptions are preserved.
   */
  async restart(): Promise<void> {
    await this.stop();
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

  /**
   * Get composite EventBus for unified event subscriptions.
   * Routes domain events to domainBus, runtime events to runtimeBus.
   */
  getEventBus(): TypedEventBus<HDRCanvasEventMap> {
    return this.compositeEventBus;
  }

  // ============================================================
  // Private
  // ============================================================

  /**
   * Bootstrap environment-independent core services.
   * Called once in the constructor — these services survive restart.
   */
  private bootstrapCore(): void {
    this.registry.register('eventBus', () => new TypedEventBus<DomainEventMap>());
    this.registry.register('runtimeEventBus', () => {
      const bus = new TypedEventBus<RuntimeEventMap>();
      this.kernel.setEventBus(bus);
      return bus;
    });
    this.registry.register('logger', () => this.logger);
  }

  /**
   * Bootstrap runtime services that depend on resolved config.
   * Called in start() after resolveConfig() — cleared on stop(), re-registered on restart.
   */
  private bootstrapRuntime(config: CoreConfig): void {
    // Renderer (managed) — use custom backend if provided, otherwise default to WebGPU
    this.registry.registerManaged('renderer', () => {
      const renderer =
        config.renderer ??
        (() => {
          setGPUDeviceLogger(this.logger);
          return new WebGPURenderer(this.canvas, {
            transparent: config.transparent,
            logger: this.logger,
          });
        })();
      this.registry.trackManagedInstance('renderer', renderer);
      return renderer;
    });

    // Settings (pure)
    this.registry.register('settings', () => {
      return new RenderSettings(
        config.renderOptions, // autoState — fully resolved by ConfigResolver
        config.userRenderOptions, // userState — explicit user intent, extracted in resolveConfig
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
        (info) => {
          const derived = deriveImageDefaults(info);
          this.registry.get('settings').applyImageDefaults(derived);
        },
        eventBus
      );

      // Re-render after image upload completes
      eventBus.on('loading:stateChange', ({ state }) => {
        this.logger.log(`[CanvasRuntime] Loading state changed: ${state.status}`);
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
  private createContext(config: CoreConfig): RuntimeContext {
    return {
      eventBus: this.registry.get('eventBus'),
      signal: this.kernel.signal,
      logger: this.logger,
      config,
    };
  }

  /**
   * Create PluginContext for plugin install
   */
  private createPluginContext(): import('./Plugin').PluginContext {
    return {
      canvas: this.canvas,
      services: this.registry,
      events: this.compositeEventBus,
      logger: this.logger,
    };
  }

  /**
   * Resolve raw user options into a fully-populated CoreConfig.
   * Called once in start() before bootstrapRuntime().
   */
  private async resolveConfig(): Promise<CoreConfig> {
    const config = await resolveConfig(this.rawOptions);
    this.logger.log(
      `[CanvasRuntime] config resolved: hdrMode=${config.renderOptions.hdrMode} colorSpace=${config.renderOptions.colorSpace} toneMapping=${config.renderOptions.toneMapping}`
    );
    return config;
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
   * Called once in constructor after bootstrapCore() — never reset on restart.
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
