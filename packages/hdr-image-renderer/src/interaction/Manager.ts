/**
 * InteractionManager - Interaction handler lifecycle coordination
 *
 * Creates and manages MouseHandler, TouchHandler, and KeyboardHandler instances.
 * Wires up callbacks from handlers to viewport mutations and commands.
 */

import type { InteractionOptions, ViewportConfig } from '../types';
import type { ViewportController } from '../viewport/Controller';
import { KeyboardHandler } from './KeyboardHandler';
import { MouseHandler } from './MouseHandler';
import { TouchHandler } from './TouchHandler';

interface ZoomCommands {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomToActual: () => void;
}

export class InteractionManager {
  private canvas: HTMLCanvasElement;
  private viewportController: ViewportController;
  private getZoomCommands: () => ZoomCommands;
  private cleanupFunctions: Array<() => void> = [];

  constructor(
    canvas: HTMLCanvasElement,
    viewportController: ViewportController,
    getZoomCommands: () => ZoomCommands
  ) {
    this.canvas = canvas;
    this.viewportController = viewportController;
    this.getZoomCommands = getZoomCommands;
  }

  /**
   * Attach mouse, touch, and keyboard interactions for zoom and pan.
   * @param options - Interaction options including viewport config and callbacks
   * @returns Cleanup function to detach all listeners
   */
  attach(options: InteractionOptions = {}): () => void {
    // Clean up any existing handlers
    this.detach();

    const { wheel, drag, touch, keyboard, ...viewportConfig } = options;

    // Apply viewport config
    if (Object.keys(viewportConfig).length > 0) {
      this.viewportController.updateConfig(viewportConfig as Partial<ViewportConfig>);
    }

    // Parse wheel config
    const wheelEnabled = typeof wheel === 'boolean' ? wheel : (wheel?.enabled ?? true);
    const wheelSensitivity = typeof wheel === 'object' ? (wheel.sensitivity ?? 0.001) : 0.001;

    // Create mouse handler with config
    const mouseHandler = new MouseHandler(
      this.canvas,
      {
        onWheel: (deltaY, cursorX, cursorY) => {
          // Calculate zoom from wheel delta
          const zoomDelta = -deltaY * wheelSensitivity;
          const currentZoom = this.viewportController.getState().zoom;
          const newZoom = currentZoom * Math.exp(zoomDelta);

          this.viewportController.applyMutation({
            type: 'zoom',
            zoom: newZoom,
            centerX: cursorX,
            centerY: cursorY,
            source: 'wheel',
          });
        },
        onDrag: (deltaX, deltaY) =>
          this.viewportController.applyMutation({
            type: 'pan',
            deltaX,
            deltaY,
            source: 'drag',
          }),
        onDblClick: () =>
          this.viewportController.applyMutation({
            type: 'reset',
            source: 'dblclick',
          }),
      },
      { wheel: wheelEnabled, drag }
    );

    // Create touch handler with config
    const touchHandler = new TouchHandler(
      this.canvas,
      {
        onPan: (deltaX, deltaY) =>
          this.viewportController.applyMutation({
            type: 'pan',
            deltaX,
            deltaY,
            source: 'drag',
          }),
        onPinch: (scaleDelta, centerX, centerY) => {
          // Calculate new zoom from pinch scale
          const currentZoom = this.viewportController.getState().zoom;
          const newZoom = currentZoom * scaleDelta;

          this.viewportController.applyMutation({
            type: 'zoom',
            zoom: newZoom,
            centerX,
            centerY,
            source: 'pinch',
          });
        },
        onDoubleTap: () =>
          this.viewportController.applyMutation({
            type: 'reset',
            source: 'doubletap',
          }),
      },
      { enabled: touch }
    );

    // Get zoom commands
    const commands = this.getZoomCommands();

    // Create keyboard handler with config
    const keyboardHandler = new KeyboardHandler(
      this.canvas,
      {
        onPan: (deltaX, deltaY) =>
          this.viewportController.applyMutation({
            type: 'pan',
            deltaX,
            deltaY,
            source: 'keyboard',
          }),
        onZoomIn: () => commands.zoomIn(),
        onZoomOut: () => commands.zoomOut(),
        onZoomToFit: () => commands.zoomToFit(),
        onZoomToActual: () => commands.zoomToActual(),
        onReset: () =>
          this.viewportController.applyMutation({
            type: 'reset',
            source: 'keyboard',
            duration: 0,
          }),
      },
      typeof keyboard === 'boolean' ? { enabled: keyboard } : keyboard
    );

    // Attach all handlers
    const detachMouse = mouseHandler.attach();
    const detachTouch = touchHandler.attach();
    const detachKeyboard = keyboardHandler.attach();

    this.cleanupFunctions = [detachMouse, detachTouch, detachKeyboard];

    // Return cleanup function
    return () => this.detach();
  }

  /**
   * Detach all interaction handlers
   */
  detach(): void {
    for (const cleanup of this.cleanupFunctions) {
      cleanup();
    }
    this.cleanupFunctions = [];
  }
}
