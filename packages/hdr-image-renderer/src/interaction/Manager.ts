/**
 * InteractionManager - Interaction handler lifecycle coordination
 *
 * Creates and manages PointerHandler and KeyboardHandler instances.
 * Wires up callbacks from handlers to viewport mutations and commands.
 *
 * Uses ViewportFacade interface to decouple from specific viewport implementations.
 */

import type { RuntimeContext, RuntimeService } from '../core/RuntimeService';
import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import type { InteractionAPI, InteractionOptions, ViewportConfig } from '../types';
import { KeyboardHandler } from './KeyboardHandler';
import { PointerHandler } from './PointerHandler';
import type { ViewportFacade } from './ViewportFacade';

interface ZoomCommands {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomToActual: () => void;
}

export class InteractionManager implements InteractionAPI, RuntimeService {
  private canvas: HTMLCanvasElement;
  private target: ViewportFacade;
  private getZoomCommands: () => ZoomCommands;
  private cleanupFunctions: Array<() => void> = [];
  private logger: Logger;

  constructor(
    canvas: HTMLCanvasElement,
    target: ViewportFacade,
    getZoomCommands: () => ZoomCommands,
    logger: Logger = silentLogger
  ) {
    this.canvas = canvas;
    this.target = target;
    this.getZoomCommands = getZoomCommands;
    this.logger = logger;
  }

  /**
   * Attach pointer and keyboard interactions for zoom and pan.
   * @param options - Interaction options including viewport config and callbacks
   * @returns Cleanup function to detach all listeners
   */
  attach(options: InteractionOptions = {}): () => void {
    // Clean up any existing handlers
    this.detach();

    const { wheel, drag, touch, keyboard, ...viewportConfig } = options;

    this.logger.log('[InteractionManager] attach:', { wheel, drag, touch, keyboard });

    // Apply viewport config
    if (Object.keys(viewportConfig).length > 0) {
      this.target.updateConfig(viewportConfig as Partial<ViewportConfig>);
    }

    // Parse wheel config
    const wheelEnabled = typeof wheel === 'boolean' ? wheel : (wheel?.enabled ?? true);
    const wheelSensitivity = typeof wheel === 'object' ? (wheel.sensitivity ?? 0.001) : 0.001;

    // Create unified pointer handler (mouse + touch + pen)
    const pointerHandler = new PointerHandler(
      this.canvas,
      {
        canPan: (dx, dy) => this.target.canPan(dx, dy),
        onPan: (deltaX, deltaY) =>
          this.target.applyMutation({
            type: 'pan',
            deltaX,
            deltaY,
            source: 'drag',
          }),
        onPinch: (scaleDelta, centerX, centerY) => {
          const currentZoom = this.target.getState().zoom;
          const newZoom = currentZoom * scaleDelta;
          this.target.applyMutation({
            type: 'zoom',
            zoom: newZoom,
            centerX,
            centerY,
            source: 'pinch',
          });
        },
        onDoubleTap: () => {
          this.target.applyMutation({
            type: 'reset',
            source: 'dblclick',
          });
        },
        onWheel: (deltaY, cursorX, cursorY) => {
          const zoomDelta = -deltaY * wheelSensitivity;
          const currentZoom = this.target.getState().zoom;
          const newZoom = currentZoom * Math.exp(zoomDelta);
          this.target.applyMutation({
            type: 'zoom',
            zoom: newZoom,
            centerX: cursorX,
            centerY: cursorY,
            source: 'wheel',
          });
        },
      },
      { wheel: wheelEnabled, drag, touch }
    );

    // Get zoom commands
    const commands = this.getZoomCommands();

    // Create keyboard handler with config
    const keyboardHandler = new KeyboardHandler(
      this.canvas,
      {
        canPan: (deltaX, deltaY) => this.target.canPan(deltaX, deltaY),
        onPan: (deltaX, deltaY) => {
          this.target.applyMutation({
            type: 'pan',
            deltaX,
            deltaY,
            source: 'keyboard',
          });
        },
        onZoomIn: () => commands.zoomIn(),
        onZoomOut: () => commands.zoomOut(),
        onZoomToFit: () => commands.zoomToFit(),
        onZoomToActual: () => commands.zoomToActual(),
        onReset: () => {
          this.target.applyMutation({
            type: 'reset',
            source: 'keyboard',
            duration: 0,
          });
        },
      },
      typeof keyboard === 'boolean' ? { enabled: keyboard } : keyboard
    );

    // Attach all handlers
    const detachPointer = pointerHandler.attach();
    const detachKeyboard = keyboardHandler.attach();

    this.cleanupFunctions = [detachPointer, detachKeyboard];

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

  // ============================================================
  // RuntimeService implementation
  // ============================================================

  async init(_ctx: RuntimeContext): Promise<void> {
    // no-op — configured via constructor
  }

  start(): void {
    // no-op — interactions are attached explicitly via attach()
  }

  stop(): void {
    this.detach();
  }

  dispose(): void {
    this.detach();
  }
}
