/**
 * TypedEventBus - Type-safe internal event system
 *
 * Generic event bus with full TypeScript type safety on event names and payloads.
 * Supports throttling and multiple listeners per event.
 */

export interface EventBusOptions {
  throttle?: number;
}

// biome-ignore lint/suspicious/noExplicitAny: Constraint allows any event payload type, concrete types enforced via EventMap parameter
export class TypedEventBus<EventMap extends Record<string, any>> {
  // biome-ignore lint/suspicious/noExplicitAny: Type erasure for internal storage, public API is type-safe
  private listeners = new Map<keyof EventMap, Set<(data: any) => void>>();
  // biome-ignore lint/complexity/noBannedTypes: WeakMap requires function reference, type-safe via generics in methods
  private throttledCallbacks = new WeakMap<Function, Function>();

  /**
   * Subscribe to event with type-safe callback
   *
   * @param event - Event name (type-checked against EventMap keys)
   * @param callback - Callback function (data type inferred from EventMap)
   * @param options - Optional throttle configuration
   * @returns Unsubscribe function
   */
  on<K extends keyof EventMap>(
    event: K,
    callback: (data: EventMap[K]) => void,
    options?: EventBusOptions
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const wrappedCallback = options?.throttle
      ? this.throttle(callback, options.throttle)
      : callback;

    // Store mapping for cleanup
    if (options?.throttle) {
      this.throttledCallbacks.set(callback, wrappedCallback);
    }

    this.listeners.get(event)!.add(wrappedCallback);

    // Return unsubscribe function
    return () => {
      const callbackToRemove = this.throttledCallbacks.get(callback) ?? callback;
      // biome-ignore lint/suspicious/noExplicitAny: Type erasure for heterogeneous event map storage
      this.listeners.get(event)?.delete(callbackToRemove as any);
      if (options?.throttle) {
        this.throttledCallbacks.delete(callback);
      }
    };
  }

  /**
   * Emit event to all subscribers with type-safe data
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;

    for (const callback of callbacks) {
      callback(data);
    }
  }

  /**
   * Remove all listeners for specific event
   */
  off<K extends keyof EventMap>(event: K): void {
    this.listeners.delete(event);
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
    // WeakMap will be garbage collected automatically
  }

  /**
   * Throttle implementation
   *
   * Ensures callback is not called more frequently than specified interval.
   * Trailing call is scheduled to ensure last update is not lost.
   */
  // biome-ignore lint/suspicious/noExplicitAny: Generic throttle needs any for flexibility, constrained by T parameter
  private throttle<T extends (data: any) => void>(fn: T, ms: number): T {
    let lastCall = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    // biome-ignore lint/suspicious/noExplicitAny: Closure must match generic signature T
    return ((data: any) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCall;

      if (timeSinceLastCall >= ms) {
        lastCall = now;
        fn(data);
      } else {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          lastCall = Date.now();
          fn(data);
        }, ms - timeSinceLastCall);
      }
    }) as T;
  }
}
