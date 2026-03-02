/**
 * CanvasResizer - Auto-resize canvas based on CSS layout
 *
 * Uses ResizeObserver to automatically sync canvas pixel dimensions
 * with CSS display size, accounting for device pixel ratio.
 */

import type { DomainEventMap } from '../core/EventTypes';
import type { RuntimeContext, RuntimeService } from '../core/RuntimeService';
import type { TypedEventBus } from '../core/TypedEventBus';
import type { ResizeService } from './ResizeService';

export class CanvasResizer implements ResizeService, RuntimeService {
  private canvas: HTMLCanvasElement;
  private observer: ResizeObserver | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private eventBus?: TypedEventBus<DomainEventMap>
  ) {
    this.canvas = canvas;
  }

  /**
   * Enable automatic canvas resize based on CSS layout size.
   * @returns Cleanup function to disable auto-resize
   */
  enable(): () => void {
    if (this.observer) {
      return () => this.disable();
    }

    const dpr = window.devicePixelRatio || 1;

    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);
        const dWidth = Math.abs(this.canvas.width - pixelWidth);
        const dHeight = Math.abs(this.canvas.height - pixelHeight);
        if (dWidth > dpr || dHeight > dpr) {
          this.canvas.width = pixelWidth;
          this.canvas.height = pixelHeight;
          this.eventBus?.emit('canvas:resized', {
            width: pixelWidth,
            height: pixelHeight,
          });
        }
      }
    });

    this.observer.observe(this.canvas);

    return () => this.disable();
  }

  /**
   * Disable automatic canvas resize
   */
  disable(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Check if auto-resize is enabled
   */
  isEnabled(): boolean {
    return this.observer !== null;
  }

  // ============================================================
  // RuntimeService implementation
  // ============================================================

  async init(_ctx: RuntimeContext): Promise<void> {
    // no-op
  }

  start(): void {
    // no-op — resizer is enabled explicitly via enable()
  }

  stop(): void {
    this.disable();
  }

  dispose(): void {
    this.disable();
  }
}
