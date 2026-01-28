/**
 * ViewportCommands - High-level viewport operations
 *
 * Provides user-friendly viewport commands (zoomIn, zoomToFit, etc.)
 * that delegate to ViewportController mutations.
 */

import type { ObjectFit, ViewportState } from '../types';
import type { ViewportController } from './Controller';

export class ViewportCommands {
  private viewportController: ViewportController;
  private getImageDimensions: () => { width: number; height: number };
  private getCanvasSize: () => { width: number; height: number };
  private getObjectFit: () => ObjectFit;

  constructor(
    viewportController: ViewportController,
    getImageDimensions: () => { width: number; height: number },
    getCanvasSize: () => { width: number; height: number },
    getObjectFit: () => ObjectFit
  ) {
    this.viewportController = viewportController;
    this.getImageDimensions = getImageDimensions;
    this.getCanvasSize = getCanvasSize;
    this.getObjectFit = getObjectFit;
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

    const fitScale = this.computeBaseFitScale(imageDims, canvasSize);
    const actualZoom = 1 / fitScale;

    this.viewportController.applyMutation({
      type: 'zoom',
      zoom: actualZoom,
      source: 'button',
    });
  }

  /**
   * Compute the base fit scale for the current objectFit mode.
   * This is the ratio of canvas pixels to image pixels at zoom=1.
   */
  private computeBaseFitScale(
    imageDims: { width: number; height: number },
    canvasSize: { width: number; height: number }
  ): number {
    const imageAspect = imageDims.width / imageDims.height;
    const canvasAspect = canvasSize.width / canvasSize.height;
    const objectFit = this.getObjectFit();

    const containScale =
      imageAspect > canvasAspect
        ? canvasSize.width / imageDims.width
        : canvasSize.height / imageDims.height;

    switch (objectFit) {
      case 'contain':
        return containScale;

      case 'cover':
        // Cover uses the larger scale (opposite of contain)
        return imageAspect > canvasAspect
          ? canvasSize.height / imageDims.height
          : canvasSize.width / imageDims.width;

      case 'fill':
        // Fill stretches non-uniformly; use contain scale as reasonable fallback
        return containScale;

      case 'none':
        // At zoom=1, image is already at 1:1 pixels
        return 1;

      case 'scale-down':
        // Contain but never upscale
        return containScale < 1 ? containScale : 1;
    }
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
