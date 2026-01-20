/**
 * HDRCanvas - Main API (Facade)
 *
 * High-level interface for rendering HDR images with WebGPU.
 * Coordinates specialized components for rendering, viewport control, and interactions.
 */

import { InteractionManager } from './interaction';
import { CanvasResizer, RenderSettings } from './render';
import { WebGPURenderer } from './render';
import type {
  CanvasAPI,
  HDRCanvasOptions,
  ImageData,
  InteractionAPI,
  RenderAPI,
  ViewportAPI,
} from './types';
import { ViewportCommands, ViewportController, ViewportSubscriptions } from './viewport';

export class HDRCanvas {
  private canvas: HTMLCanvasElement;
  private renderer: WebGPURenderer;
  private viewportController: ViewportController;
  private initialized = false;

  // Focused components
  private settings: RenderSettings;
  private commands: ViewportCommands;
  private interactions: InteractionManager;
  private resizer: CanvasResizer;
  private subscriptions: ViewportSubscriptions;

  // ============================================================
  // Namespaced API
  // ============================================================

  /**
   * Viewport control API
   * Manages zoom, pan, and viewport state
   */
  readonly viewport: ViewportAPI = {
    // State
    getState: () => this.viewportController.getState(),
    setConfig: (config) => this.viewportController.updateConfig(config),

    // Commands (instant)
    setZoom: (zoom) => this.commands.setZoom(zoom),
    setPan: (x, y) => this.commands.setPan(x, y),
    setViewport: (viewport) => this.commands.setViewport(viewport),

    // Commands (animated)
    zoomIn: (factor) => this.commands.zoomIn(factor),
    zoomOut: (factor) => this.commands.zoomOut(factor),
    zoomToFit: () => this.commands.zoomToFit(),
    zoomToActual: () => this.commands.zoomToActual(),
    reset: (animated) => this.commands.reset(animated),

    // Events
    onZoom: (callback, throttleMs) => this.subscriptions.onZoom(callback, throttleMs),
    onPan: (callback, throttleMs) => this.subscriptions.onPan(callback, throttleMs),
    onUpdate: (callback) => this.subscriptions.onUpdate(callback),
    onMutation: (listener) => this.subscriptions.onMutation(listener),
    onTransitionEnd: (listener) => this.subscriptions.onTransitionEnd(listener),
    onReset: (callback) => this.subscriptions.onReset(callback),

    // Filtered events (convenience)
    onWheelZoom: (callback) => this.subscriptions.onWheelZoom(callback),
    onButtonZoom: (callback) => this.subscriptions.onButtonZoom(callback),
    onDragPan: (callback) => this.subscriptions.onDragPan(callback),
  };

  /**
   * Render settings API
   * Controls exposure, tone mapping, and visualization
   */
  readonly render: RenderAPI = {
    getState: () => this.settings.getState(),
    setExposure: (ev) => this.settings.setExposure(ev),
    setToneMapping: (operator) => this.settings.setToneMapping(operator),
    setHDRMode: (enabled) => this.settings.setHDRMode(enabled),
    setColorSpace: (space) => this.settings.setColorSpace(space),
    setVisualizationMode: (mode) => this.settings.setVisualizationMode(mode),
    updateOptions: (options) => this.settings.updateOptions(options),
  };

  /**
   * Interaction management API
   * Handles mouse, touch, and keyboard interactions
   */
  readonly interaction: InteractionAPI = {
    attach: (options) => this.interactions.attach(options),
    detach: () => this.interactions.detach(),
  };

  /**
   * Canvas control API
   * Canvas-specific operations (auto-resize, image info, etc.)
   */
  readonly control: CanvasAPI = {
    enableAutoResize: () => this.resizer.enable(),
    disableAutoResize: () => this.resizer.disable(),
    getImageDimensions: () => this.renderer.getImageDimensions(),
    getImageInfo: () => {
      const dims = this.renderer.getImageDimensions();
      return {
        width: dims.width,
        height: dims.height,
        aspectRatio: dims.width / dims.height,
      };
    },
    forceRender: () => {
      if (this.initialized) {
        this.renderInternal();
      }
    },
  };

  constructor(canvas: HTMLCanvasElement, options: HDRCanvasOptions = {}) {
    this.canvas = canvas;

    // Initialize core components
    this.renderer = new WebGPURenderer(canvas, { transparent: options.transparent });
    this.viewportController = new ViewportController();
    this.viewportController.onUpdate(() => this.renderInternal());

    // Initialize focused components
    this.settings = new RenderSettings(options, () => this.renderInternal());

    this.commands = new ViewportCommands(
      this.viewportController,
      () => this.renderer.getImageDimensions(),
      () => {
        const rect = this.canvas.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }
    );

    this.interactions = new InteractionManager(this.canvas, this.viewportController, () => ({
      zoomIn: () => this.viewport.zoomIn(),
      zoomOut: () => this.viewport.zoomOut(),
      zoomToFit: () => this.viewport.zoomToFit(),
      zoomToActual: () => this.viewport.zoomToActual(),
    }));

    this.resizer = new CanvasResizer(this.canvas, () => this.control.forceRender());
    this.subscriptions = new ViewportSubscriptions(this.viewportController);
  }

  // ============================================================
  // Initialization & Loading
  // ============================================================

  /**
   * Initialize WebGPU context (must be called before loading images)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.renderer.initialize();
    this.initialized = true;
  }

  /**
   * Load image from ImageData (LinearImageData or EncodedImageData)
   */
  async loadImage(data: ImageData): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.renderer.uploadImage(data);
    this.renderInternal();
  }

  // ============================================================
  // Rendering
  // ============================================================

  /**
   * Internal render method (called by viewport/settings changes)
   */
  private renderInternal(): void {
    if (!this.initialized) return;

    this.renderer.render({
      ...this.settings.getState(),
      viewport: this.viewportController.getState(),
    });
  }

  /**
   * Cleanup GPU resources
   */
  destroy(): void {
    this.resizer.disable();
    this.interactions.detach();
    this.viewportController.destroy();
    if (this.initialized) {
      this.renderer.destroy();
      this.initialized = false;
    }
  }
}
