/**
 * Plugin System — Core Interfaces
 *
 * HDRPlugin is the single extension point for all plugin types:
 *
 * - RenderPlugin: subscribe to `render:beforeFrame` / `render:complete` events
 * - InputPlugin:  add DOM listeners on ctx.canvas or access viewport via ctx.services
 * - ExportPlugin: extend export via ctx.services.get('export')
 *
 * Usage:
 *   const canvas = new HDRCanvas(element)
 *     .use(myPlugin)
 *     .use(anotherPlugin)
 *   await canvas.initialize()
 */

import type { Logger } from '../logger';
import type { ServiceRegistry } from './CanvasCore';
import type { HDRCanvasEventMap } from './EventTypes';
import type { TypedEventBus } from './TypedEventBus';

/**
 * Context provided to a plugin during install.
 *
 * Gives access to:
 * - `canvas`   — the HTMLCanvasElement (for overlays, custom DOM listeners)
 * - `services` — ServiceRegistry (read/extend core services)
 * - `events`   — unified TypedEventBus (subscribe to any canvas event)
 * - `logger`   — debug logger (respects debug flag from HDRCanvasOptions)
 */
export interface PluginContext {
  /** The underlying HTMLCanvasElement */
  readonly canvas: HTMLCanvasElement;
  /** Full access to the DI service registry */
  readonly services: ServiceRegistry;
  /** Unified event bus (domain + runtime events) */
  readonly events: TypedEventBus<HDRCanvasEventMap>;
  /** Debug logger */
  readonly logger: Logger;
}

/**
 * Plugin interface — implement this to extend HDRCanvas.
 *
 * @example
 * const overlayPlugin: HDRPlugin = {
 *   name: 'my-overlay',
 *   install(ctx) {
 *     ctx.events.on('render:complete', () => drawOverlay(ctx.canvas))
 *   },
 *   uninstall() {
 *     // cleanup
 *   }
 * }
 */
export interface HDRPlugin {
  /** Unique plugin identifier (used for logging and error messages) */
  readonly name: string;

  /**
   * Called when the plugin is activated.
   *
   * For plugins registered before `initialize()`: called after all services
   * are initialized and the runtime transitions to 'running'.
   *
   * For plugins registered after `initialize()` (hot-add): called immediately.
   *
   * Use this to subscribe to events, attach DOM listeners, or set up custom services.
   */
  install(ctx: PluginContext): void | Promise<void>;

  /**
   * Called when the plugin is deactivated (on `canvas.destroy()` or `restart()`).
   *
   * Use this to unsubscribe event listeners, remove DOM handlers, and free resources.
   * Optional — if not provided, the plugin is considered stateless.
   */
  uninstall?(): void | Promise<void>;
}
