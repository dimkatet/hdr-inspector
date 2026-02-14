/**
 * EventBus - Simple internal event system for CanvasCore
 * Used for decoupled communication between subsystems
 */

type EventCallback = (data?: unknown) => void;

export interface EventBusOptions {
  throttle?: number;
}

export class EventBus {
  private listeners = new Map<string, Set<EventCallback>>();

  /**
   * Subscribe to event
   */
  on(event: string, callback: EventCallback, options?: EventBusOptions): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const wrappedCallback = options?.throttle
      ? this.throttle(callback, options.throttle)
      : callback;

    this.listeners.get(event)!.add(wrappedCallback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(wrappedCallback);
    };
  }

  /**
   * Emit event to all subscribers
   */
  emit(event: string, data?: unknown): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;

    for (const callback of callbacks) {
      callback(data);
    }
  }

  /**
   * Remove all listeners for event
   */
  off(event: string): void {
    this.listeners.delete(event);
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Simple throttle implementation
   */
  private throttle(fn: EventCallback, ms: number): EventCallback {
    let lastCall = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return (data?: unknown) => {
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
    };
  }
}
