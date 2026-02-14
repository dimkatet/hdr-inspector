/**
 * ViewportCommandService - Interface for viewport command operations
 *
 * Abstracts high-level viewport commands (zoom, pan, reset) from
 * their concrete implementation. Used by CanvasCore and HDRCanvas facade.
 */

import type { ViewportState } from '../types';

/**
 * Interface for executing viewport commands
 *
 * Provides both animated commands (zoomIn, zoomOut, etc.) and
 * instant state setters (setZoom, setPan, setViewport).
 */
export interface ViewportCommandService {
  /** Zoom in by factor (default: 2x, animated) */
  zoomIn(factor?: number): void;
  /** Zoom out by factor (default: 2x, animated) */
  zoomOut(factor?: number): void;
  /** Zoom to fit entire image in canvas (animated) */
  zoomToFit(): void;
  /** Zoom to actual size, 1:1 pixel mapping (animated) */
  zoomToActual(): void;
  /** Reset viewport to default state (zoom 1, no pan) */
  reset(animated?: boolean): void;
  /** Set zoom level (instant, no animation) */
  setZoom(zoom: number): void;
  /** Set pan offset (instant, no animation) */
  setPan(x: number, y: number): void;
  /** Set complete viewport state (instant, no animation) */
  setViewport(viewport: Partial<ViewportState>): void;
}
