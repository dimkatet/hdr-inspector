/**
 * HDRCanvas Instance Interface
 *
 * Complete public API interface for HDRCanvas instance.
 * Used for React adapter layer to avoid concrete class dependency.
 */

import type { HDRCanvasEventMap } from '../../core/EventTypes';
import type { HDRPlugin } from '../../core/Plugin';
import type { EventBusOptions } from '../../core/TypedEventBus';
import type { CanvasAPI } from './canvas';
import type { ExportAPI } from './export';
import type { InteractionAPI } from './interaction';
import type { LoadingAPI } from './loading';
import type { RenderAPI } from './render';
import type { ViewportAPI } from './viewport';

/**
 * HDRCanvas instance interface
 * Describes the complete public API without coupling to concrete implementation
 */
export interface IHDRCanvas {
  /** Viewport control API - manages zoom, pan, and viewport state */
  readonly viewport: ViewportAPI;
  /** Render settings API - controls exposure, tone mapping, and visualization */
  readonly render: RenderAPI;
  /** Interaction management API - handles mouse, touch, and keyboard interactions */
  readonly interaction: InteractionAPI;
  /** Canvas control API - canvas-specific operations (auto-resize, image info, etc.) */
  readonly control: CanvasAPI;
  /** Image export API - export rendered image as Blob */
  readonly export: ExportAPI;
  /** Image loading API - manages async image loading with placeholder/error fallback */
  readonly loading: LoadingAPI;

  /** Initialize WebGPU context (async, idempotent) */
  initialize(): Promise<void>;
  /** Subscribe to typed events with optional throttle */
  on<K extends keyof HDRCanvasEventMap>(
    event: K,
    callback: (data: HDRCanvasEventMap[K]) => void,
    options?: EventBusOptions
  ): () => void;
  /** Register a plugin (chainable, hot-add supported after initialize()) */
  use(plugin: HDRPlugin): this;
  /** Cleanup all resources */
  destroy(): void;
}
