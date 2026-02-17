/**
 * RuntimeKernel - State machine + abort signal management
 *
 * Owns:
 * - Runtime state transitions (idle → initializing → running → stopping → stopped → error)
 * - AbortController lifecycle (new controller per start, abort on stop)
 * - State change event emission
 *
 * Does NOT own:
 * - Service registration or bootstrap
 * - Render coordination
 */

import type { RuntimeEventMap } from './EventTypes';
import type { RuntimeState } from './RuntimeService';
import type { TypedEventBus } from './TypedEventBus';

export class RuntimeKernel {
  private _state: RuntimeState = 'idle';
  private abortController = new AbortController();
  private eventBus?: TypedEventBus<RuntimeEventMap>;

  get state(): RuntimeState {
    return this._state;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Bind event bus for state change emission.
   * Called after eventBus is registered in ServiceRegistry.
   */
  setEventBus(eventBus: TypedEventBus<RuntimeEventMap>): void {
    this.eventBus = eventBus;
  }

  /**
   * Prepare for start: validate state, create fresh abort controller.
   * Returns false if already running/initializing.
   */
  prepareStart(): boolean {
    if (this._state !== 'idle' && this._state !== 'stopped') {
      return false;
    }
    this.abortController = new AbortController();
    this.transitionTo('initializing');
    return true;
  }

  markRunning(): void {
    this.transitionTo('running');
  }

  markError(): void {
    this.transitionTo('error');
  }

  /**
   * Prepare for stop: validate state, abort pending operations.
   * Returns false if already stopped/idle.
   */
  prepareStop(): boolean {
    if (this._state === 'stopped' || this._state === 'idle') {
      return false;
    }
    this.transitionTo('stopping');
    this.abortController.abort();
    return true;
  }

  markStopped(): void {
    this.transitionTo('stopped');
  }

  private transitionTo(newState: RuntimeState): void {
    const previousState = this._state;
    this._state = newState;
    try {
      this.eventBus?.emit('runtime:stateChange', { state: newState, previousState });
    } catch {
      // EventBus may be cleared during stop — ignore
    }
  }
}
