/**
 * CanvasResizer - Auto-resize canvas based on CSS layout
 *
 * Uses ResizeObserver to automatically sync canvas pixel dimensions
 * with CSS display size, accounting for device pixel ratio.
 */

export class CanvasResizer {
  private canvas: HTMLCanvasElement;
  private onResize: () => void;
  private observer: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, onResize: () => void) {
    this.canvas = canvas;
    this.onResize = onResize;
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
          this.onResize();
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
}
