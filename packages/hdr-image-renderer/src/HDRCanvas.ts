/**
 * HDRCanvas - Main API (Facade)
 *
 * High-level interface for rendering HDR images with WebGPU.
 * Coordinates specialized components for rendering, viewport control, and interactions.
 */

import { ImageLoader } from './image';
import { InteractionManager } from './interaction';
import { CanvasResizer, RenderSettings } from './render';
import { WebGPURenderer } from './render';
import type {
  HDRCanvasOptions,
  ImageInfo,
  InteractionOptions,
  LinearImageData,
  MutationListener,
  RenderState,
  ViewportConfig,
  ViewportState,
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

  constructor(canvas: HTMLCanvasElement, options: HDRCanvasOptions = {}) {
    this.canvas = canvas;

    // Initialize core components
    this.renderer = new WebGPURenderer(canvas, { transparent: options.transparent });
    this.viewportController = new ViewportController();
    this.viewportController.onUpdate(() => this.render());

    // Initialize focused components
    this.settings = new RenderSettings(options, () => this.render());

    this.commands = new ViewportCommands(
      this.viewportController,
      () => this.renderer.getImageDimensions(),
      () => {
        const rect = this.canvas.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }
    );

    this.interactions = new InteractionManager(this.canvas, this.viewportController, () => ({
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      zoomToFit: () => this.zoomToFit(),
      zoomToActual: () => this.zoomToActual(),
    }));

    this.resizer = new CanvasResizer(this.canvas, () => this.forceRender());
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
   * Load image from LinearImageData
   */
  async loadImage(data: LinearImageData): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.renderer.uploadImage(data);
    this.render();
  }

  /**
   * Load Radiance HDR file from ArrayBuffer
   */
  async loadRadianceHDR(buffer: ArrayBuffer): Promise<void> {
    const imageData = await ImageLoader.decodeRadianceHDR(buffer);
    return this.loadImage(imageData);
  }

  /**
   * Load file with auto-detection of format
   */
  async loadFile(file: File): Promise<void> {
    const imageData = await ImageLoader.decodeFile(file);
    return this.loadImage(imageData);
  }

  // ============================================================
  // Render Settings
  // ============================================================

  /**
   * Set exposure value in stops (EV)
   */
  setExposure(ev: number): void {
    this.settings.setExposure(ev);
  }

  /**
   * Set tone mapping operator
   */
  setToneMapping(operator: 'none' | 'reinhard' | 'aces'): void {
    this.settings.setToneMapping(operator);
  }

  /**
   * Enable/disable HDR mode
   */
  setHDRMode(enabled: boolean): void {
    this.settings.setHDRMode(enabled);
  }

  /**
   * Set color space for output
   */
  setColorSpace(colorSpace: 'srgb' | 'display-p3' | 'rec2020'): void {
    this.settings.setColorSpace(colorSpace);
  }

  /**
   * Set visualization mode
   */
  setVisualizationMode(mode: 'rgb' | 'luminance' | 'clipping'): void {
    this.settings.setVisualizationMode(mode);
  }

  /**
   * Get current render state
   */
  getRenderState(): RenderState {
    return this.settings.getState();
  }

  /**
   * Batch update render options
   */
  updateOptions(options: Partial<HDRCanvasOptions>): void {
    this.settings.updateOptions(options);
  }

  // ============================================================
  // Viewport State
  // ============================================================

  /**
   * Get current viewport state
   */
  getViewport(): ViewportState {
    return this.viewportController.getState();
  }

  /**
   * Update viewport controller configuration
   */
  setViewportConfig(config: Partial<ViewportConfig>): void {
    this.viewportController.updateConfig(config);
  }

  // ============================================================
  // Viewport Commands
  // ============================================================

  /**
   * Set zoom level (instant, no animation)
   * @param zoom Zoom level (1.0 = 100%, 2.0 = 200%)
   */
  setZoom(zoom: number): void {
    this.commands.setZoom(zoom);
  }

  /**
   * Set pan offset (instant, no animation)
   * @param x Pan X in normalized coordinates
   * @param y Pan Y in normalized coordinates
   */
  setPan(x: number, y: number): void {
    this.commands.setPan(x, y);
  }

  /**
   * Set complete viewport state (instant, no animation)
   */
  setViewport(viewport: Partial<ViewportState>): void {
    this.commands.setViewport(viewport);
  }

  /**
   * Reset viewport to default (zoom 1, no pan)
   * @param animated - Whether to animate the transition (default: true)
   */
  resetViewport(animated = true): void {
    this.commands.reset(animated);
  }

  /**
   * Zoom in by a factor (centered, animated)
   * @param factor - Zoom multiplier (default: 2)
   */
  zoomIn(factor = 2): void {
    this.commands.zoomIn(factor);
  }

  /**
   * Zoom out by a factor (centered, animated)
   * @param factor - Zoom divisor (default: 2)
   */
  zoomOut(factor = 2): void {
    this.commands.zoomOut(factor);
  }

  /**
   * Zoom to fit image in canvas (animated)
   * Shows the entire image with maximum size that fits
   */
  zoomToFit(): void {
    this.commands.zoomToFit();
  }

  /**
   * Zoom to actual size (1:1 pixel mapping, animated)
   * One image pixel = one screen pixel
   */
  zoomToActual(): void {
    this.commands.zoomToActual();
  }

  // ============================================================
  // Event Subscriptions
  // ============================================================

  /**
   * Subscribe to zoom changes (throttled for wheel/pinch events)
   * @param callback - Called with new zoom level and full viewport state
   * @param throttleMs - Throttle interval for frequent events (default: 100ms)
   * @returns Unsubscribe function
   */
  onZoom(callback: (zoom: number, state: ViewportState) => void, throttleMs = 100): () => void {
    return this.subscriptions.onZoom(callback, throttleMs);
  }

  /**
   * Subscribe to all viewport mutations (low-level)
   * @param listener - Called with mutation details and state
   * @returns Unsubscribe function
   */
  onMutation(listener: MutationListener): () => void {
    return this.subscriptions.onMutation(listener);
  }

  /**
   * Subscribe to viewport state updates (fires every animation frame)
   * @param callback - Called with current viewport state
   * @returns Unsubscribe function
   */
  onViewportChange(callback: (state: ViewportState) => void): () => void {
    return this.subscriptions.onUpdate(callback);
  }

  // ============================================================
  // Interactions
  // ============================================================

  /**
   * Attach mouse, touch, and keyboard interactions for zoom and pan.
   * @param options - Interaction options including viewport config and callbacks
   * @returns Cleanup function to detach all listeners
   */
  attachInteractions(options: InteractionOptions = {}): () => void {
    return this.interactions.attach(options);
  }

  // ============================================================
  // Auto-Resize
  // ============================================================

  /**
   * Enable automatic canvas resize based on CSS layout size.
   * Uses ResizeObserver to sync canvas pixel size with display size.
   * @returns Cleanup function to disable auto-resize
   */
  enableAutoResize(): () => void {
    return this.resizer.enable();
  }

  /**
   * Disable automatic canvas resize
   */
  disableAutoResize(): void {
    this.resizer.disable();
  }

  // ============================================================
  // Rendering
  // ============================================================

  /**
   * Render with current settings
   */
  private render(): void {
    if (!this.initialized) return;

    this.renderer.render({
      ...this.settings.getState(),
      viewport: this.viewportController.getState(),
    });
  }

  /**
   * Force re-render (e.g., after canvas resize)
   */
  forceRender(): void {
    if (this.initialized) {
      this.render();
    }
  }

  /**
   * Get loaded image dimensions
   */
  getImageDimensions(): { width: number; height: number } {
    return this.renderer.getImageDimensions();
  }

  /**
   * Get loaded image info (dimensions + aspect ratio)
   */
  getImageInfo(): ImageInfo {
    const dims = this.renderer.getImageDimensions();
    return {
      width: dims.width,
      height: dims.height,
      aspectRatio: dims.width / dims.height,
    };
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
