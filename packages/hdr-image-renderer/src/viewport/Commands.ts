/**
 * ViewportCommands - High-level viewport operations
 *
 * Provides user-friendly viewport commands (zoomIn, zoomToFit, etc.)
 * that delegate to InteractionTarget mutations.
 */

import type { InteractionTarget } from '../interaction/InteractionTarget';
import type { ObjectFit, ViewportState } from '../types';
import { ViewportLayoutService } from './LayoutService';
import type { ViewportCommandService } from './ViewportCommandService';

export class ViewportCommands implements ViewportCommandService {
  private target: InteractionTarget;
  private getImageDimensions: () => { width: number; height: number };
  private getCanvasSize: () => { width: number; height: number };
  private getObjectFit: () => ObjectFit;
  private layoutService: ViewportLayoutService;

  constructor(
    target: InteractionTarget,
    getImageDimensions: () => { width: number; height: number },
    getCanvasSize: () => { width: number; height: number },
    getObjectFit: () => ObjectFit,
    layoutService?: ViewportLayoutService
  ) {
    this.target = target;
    this.getImageDimensions = getImageDimensions;
    this.getCanvasSize = getCanvasSize;
    this.getObjectFit = getObjectFit;
    this.layoutService = layoutService ?? new ViewportLayoutService();
  }

  /**
   * Zoom in by a factor (centered, animated)
   * @param factor - Zoom multiplier (default: 2)
   */
  zoomIn(factor = 2): void {
    const currentZoom = this.target.getState().zoom;
    const newZoom = currentZoom * factor;

    this.target.applyMutation({
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
    const currentZoom = this.target.getState().zoom;
    const newZoom = currentZoom / factor;

    this.target.applyMutation({
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
    this.target.applyMutation({
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

    const objectFit = this.getObjectFit();
    const actualZoom = this.layoutService.computeActualSizeZoom(imageDims, canvasSize, objectFit);

    this.target.applyMutation({
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
    this.target.applyMutation({
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
    this.target.applyMutation({
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
    const current = this.target.getState();
    this.target.applyMutation({
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
      const current = this.target.getState();
      this.setPan(viewport.panX ?? current.panX, viewport.panY ?? current.panY);
    }
  }
}
