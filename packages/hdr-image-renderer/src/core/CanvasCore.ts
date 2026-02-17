/**
 * CanvasCore - Pure Dependency Injection container
 *
 * Responsibilities:
 * - Service registration (factories)
 * - Lazy service instantiation
 * - Type-safe service access via ServiceMap
 *
 * Does NOT manage lifecycle — that's CanvasRuntime's job.
 */

import type { ServiceMap } from './types';

export class CanvasCore {
  // biome-ignore lint/suspicious/noExplicitAny: Heterogeneous service storage, type-safe via ServiceMap in get/register
  private services = new Map<string, any>();
  // biome-ignore lint/suspicious/noExplicitAny: Heterogeneous factory storage, type-safe via ServiceMap in get/register
  private factories = new Map<string, () => any>();

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
   * Clear all services and factories
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }
}
