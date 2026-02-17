/**
 * ServiceRegistry - Dependency Injection container with managed service tracking
 *
 * Responsibilities:
 * - Service registration (factories)
 * - Lazy service instantiation
 * - Type-safe service access via ServiceMap
 * - Tracking managed services (RuntimeService lifecycle)
 *
 * Does NOT manage lifecycle — that's CanvasRuntime's job.
 */

import type { RuntimeService } from './RuntimeService';
import type { ServiceMap } from './types';

export class ServiceRegistry {
  // biome-ignore lint/suspicious/noExplicitAny: Heterogeneous service storage, type-safe via ServiceMap in get/register
  private services = new Map<string, any>();
  // biome-ignore lint/suspicious/noExplicitAny: Heterogeneous factory storage, type-safe via ServiceMap in get/register
  private factories = new Map<string, () => any>();

  private managedKeys: Array<keyof ServiceMap> = [];
  private managedInstances: Array<{ name: string; service: RuntimeService }> = [];

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
   * Register a managed service (implements RuntimeService lifecycle).
   * The registry tracks these for ordered init/start/stop/dispose.
   */
  registerManaged<K extends keyof ServiceMap>(
    name: K,
    factory: () => ServiceMap[K]
  ): void {
    this.register(name, factory);
    this.managedKeys.push(name);
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
        `[ServiceRegistry] Service "${name}" is not registered.\n` +
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
   * Track a concrete RuntimeService instance for lifecycle orchestration.
   * Called by CanvasRuntime after lazy instantiation forces creation.
   */
  trackManagedInstance(name: string, service: RuntimeService): void {
    this.managedInstances.push({ name, service });
  }

  /**
   * Get ordered list of managed service keys (for forcing lazy instantiation)
   */
  getManagedKeys(): ReadonlyArray<keyof ServiceMap> {
    return this.managedKeys;
  }

  /**
   * Get tracked managed service instances (for lifecycle orchestration)
   */
  getManagedInstances(): ReadonlyArray<{ name: string; service: RuntimeService }> {
    return this.managedInstances;
  }

  /**
   * Clear all services, factories, and managed tracking
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.managedKeys = [];
    this.managedInstances = [];
  }
}

/** @deprecated Use ServiceRegistry instead */
export { ServiceRegistry as CanvasCore };
