/**
 * PluginManager — Plugin lifecycle orchestration
 *
 * Tracks registered plugins and coordinates install/uninstall
 * in sync with the CanvasRuntime lifecycle.
 *
 * Plugins persist across restarts: uninstalled before stop, reinstalled after start.
 */

import type { Logger } from '../logger';
import type { HDRPlugin, PluginContext } from './Plugin';

export class PluginManager {
  private plugins: HDRPlugin[] = [];
  private context: PluginContext | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a plugin.
   *
   * If the runtime is already running (context is set), install immediately.
   * Otherwise, plugin will be installed during the next `installAll()` call.
   */
  add(plugin: HDRPlugin): void {
    this.plugins.push(plugin);

    if (this.context) {
      this.logger.log(`[PluginManager] Hot-installing plugin: ${plugin.name}`);
      const result = plugin.install(this.context);
      if (result instanceof Promise) {
        result.catch((err) => {
          this.logger.warn(`[PluginManager] Plugin "${plugin.name}" install failed:`, err);
        });
      }
    }
  }

  /**
   * Install all registered plugins with the given context.
   * Called by CanvasRuntime after runtime transitions to 'running'.
   */
  async installAll(ctx: PluginContext): Promise<void> {
    this.context = ctx;

    for (const plugin of this.plugins) {
      this.logger.log(`[PluginManager] Installing plugin: ${plugin.name}`);
      try {
        await plugin.install(ctx);
      } catch (err) {
        this.logger.warn(`[PluginManager] Plugin "${plugin.name}" install failed:`, err);
        throw err;
      }
    }
  }

  /**
   * Uninstall all plugins in reverse registration order.
   * Called by CanvasRuntime before stopping services.
   * Plugins are retained in the list for reinstall on next start.
   */
  async uninstallAll(): Promise<void> {
    this.context = null;

    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i];
      if (!plugin.uninstall) continue;

      this.logger.log(`[PluginManager] Uninstalling plugin: ${plugin.name}`);
      try {
        await plugin.uninstall();
      } catch (err) {
        this.logger.warn(`[PluginManager] Plugin "${plugin.name}" uninstall failed:`, err);
      }
    }
  }

  /**
   * Returns the number of registered plugins.
   */
  get size(): number {
    return this.plugins.length;
  }
}
