/**
 * RuntimeService - Lifecycle contract for managed services
 *
 * Services with lifecycle (init/start/stop/dispose) implement this interface.
 * Pure/stateless services (Settings, Export, Layout) do not need it.
 *
 * Lifecycle flow:
 *   init(ctx) → start() → [running] → stop() → dispose()
 *
 * CanvasRuntime orchestrates these calls in dependency order.
 */

import type { Logger } from '../logger';
import type { TypedEventBus } from './TypedEventBus';
import type { CoreConfig } from './types';

/**
 * Runtime lifecycle states
 */
export type RuntimeState = 'idle' | 'initializing' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Context passed to managed services during initialization.
 * Immutable after creation.
 */
export interface RuntimeContext {
  readonly eventBus: TypedEventBus<import('./EventTypes').HDRCanvasEventMap>;
  readonly signal: AbortSignal;
  readonly logger: Logger;
  readonly config: CoreConfig;
}

/**
 * Lifecycle contract for managed services.
 *
 * Managed services are those with stateful lifecycle:
 * - WebGPURenderer (async GPU init, resource cleanup)
 * - ImageLoadingManager (abort loading, cancel)
 * - ViewportController (animation frames, event subscriptions)
 * - InteractionManager (DOM event handlers)
 * - CanvasResizer (ResizeObserver)
 */
export interface RuntimeService {
  /** Initialize service with runtime context (async allowed) */
  init(ctx: RuntimeContext): Promise<void>;
  /** Start service — subscribe events, enable observers */
  start(): void;
  /** Stop service — unsubscribe, cancel, detach */
  stop(): void;
  /** Final cleanup — destroy resources */
  dispose(): void;
}
