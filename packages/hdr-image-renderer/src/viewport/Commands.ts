/**
 * ViewportCommands - High-level viewport operations
 *
 * Provides user-friendly viewport commands (zoomIn, zoomToFit, etc.)
 * that delegate to ViewportController mutations.
 */

import type { ViewportState } from '../types';
import type { ViewportController } from './Controller';

export class ViewportCommands {
  private viewportController: ViewportController;
  private getImageDimensions: () => { width: number; height: number };
  private getCanvasSize: () => { width: number; height: number };

  constructor(
    viewportController: ViewportController,
    getImageDimensions: () => { width: number; height: number },
    getCanvasSize: () => { width: number; height: number }
  ) {
    this.viewportController = viewportController;
    this.getImageDimensions = getImageDimensions;
    this.getCanvasSize = getCanvasSize;
  }

  /**
   * Zoom in by a factor (centered, animated)
   * @param factor - Zoom multiplier (default: 2)
   */
  zoomIn(factor = 2): void {
    const currentZoom = this.viewportController.getState().zoom;
    const newZoom = currentZoom * factor;

    this.viewportController.applyMutation({
      type: 'zoom',
      zoom: newZoom,
      source: 'button',
    });
  }

  /**
   * Zoom out by a factor (centered, animated)
   * @param factor - Zoom divisor (default: 2)
   */
  zoomOut(factor = 2): void {
    const currentZoom = this.viewportController.getState().zoom;
    const newZoom = currentZoom / factor;

    this.viewportController.applyMutation({
      type: 'zoom',
      zoom: newZoom,
      source: 'button',
    });
  }

  /**
   * Zoom to fit image in canvas (animated)
   * Shows the entire image with maximum size that fits
   */
  zoomToFit(): void {
    this.viewportController.applyMutation({
      type: 'zoom',
      zoom: 1,
      source: 'button',
    });
  }

  /**
   * Zoom to actual size (1:1 pixel mapping, animated)
   * One image pixel = one screen pixel
   */
  zoomToActual(): void {
    const imageDims = this.getImageDimensions();
    if (imageDims.width === 0 || imageDims.height === 0) return;

    const canvasSize = this.getCanvasSize();
    if (canvasSize.width === 0 || canvasSize.height === 0) return;

    const imageAspect = imageDims.width / imageDims.height;
    const canvasAspect = canvasSize.width / canvasSize.height;

    const fitScale =
      imageAspect > canvasAspect
        ? canvasSize.width / imageDims.width
        : canvasSize.height / imageDims.height;

    const actualZoom = 1 / fitScale;

    this.viewportController.applyMutation({
      type: 'zoom',
      zoom: actualZoom,
      source: 'button',
    });
  }

  /**
   * Reset viewport to default (zoom 1, no pan)
   * @param animated - Whether to animate the transition (default: true)
   */
  reset(animated = true): void {
    this.viewportController.applyMutation({
      type: 'reset',
      source: 'programmatic',
      duration: animated ? undefined : 0,
    });
  }

  /**
   * Set zoom level (instant, no animation)
   * @param zoom Zoom level (1.0 = 100%, 2.0 = 200%)
   */
  setZoom(zoom: number): void {
    this.viewportController.applyMutation({
      type: 'zoom',
      zoom,
      source: 'programmatic',
      duration: 0,
    });
  }

  /**
   * Set pan offset (instant, no animation)
   * @param x Pan X in normalized coordinates
   * @param y Pan Y in normalized coordinates
   */
  setPan(x: number, y: number): void {
    const current = this.viewportController.getState();
    this.viewportController.applyMutation({
      type: 'pan',
      deltaX: x - current.panX,
      deltaY: y - current.panY,
      source: 'programmatic',
      duration: 0,
    });
  }

  /**
   * Set complete viewport state (instant, no animation)
   */
  setViewport(viewport: Partial<ViewportState>): void {
    if (viewport.zoom !== undefined) {
      this.setZoom(viewport.zoom);
    }
    if (viewport.panX !== undefined || viewport.panY !== undefined) {
      const current = this.viewportController.getState();
      this.setPan(viewport.panX ?? current.panX, viewport.panY ?? current.panY);
    }
  }
}
