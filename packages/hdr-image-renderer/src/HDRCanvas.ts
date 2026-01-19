/**
 * HDRCanvas - Main API
 *
 * High-level interface for rendering HDR images with WebGPU.
 * Wraps WebGPURenderer with a simple imperative API.
 */

import { throttle } from 'throttle-debounce';
import { KeyboardHandler } from './core/KeyboardHandler';
import { MouseHandler } from './core/MouseHandler';
import { TouchHandler } from './core/TouchHandler';
import { ViewportController } from './core/ViewportController';
import { decodeRadianceHDR } from './decoders';
import { WebGPURenderer } from './renderer';
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

export class HDRCanvas {
  private canvas: HTMLCanvasElement;
  private options: Required<HDRCanvasOptions>;
  private renderer: WebGPURenderer;
  private initialized = false;
  private viewportController: ViewportController;
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, options: HDRCanvasOptions = {}) {
    this.canvas = canvas;
    this.options = {
      hdrMode: options.hdrMode ?? false,
      exposure: options.exposure ?? 0,
      toneMapping: options.toneMapping ?? 'aces',
      colorSpace: options.colorSpace ?? 'display-p3',
      visualizationMode: options.visualizationMode ?? 'rgb',
      transparent: options.transparent ?? false,
    };

    this.renderer = new WebGPURenderer(canvas, { transparent: this.options.transparent });
    this.viewportController = new ViewportController();
    this.viewportController.onUpdate(() => this.render());
  }

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
    const imageData = decodeRadianceHDR(buffer);
    return this.loadImage(imageData);
  }

  /**
   * Load file with auto-detection of format
   */
  async loadFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'hdr' || ext === 'pic') {
      return this.loadRadianceHDR(buffer);
    }

    throw new Error(`Unsupported file format: ${ext}`);
  }

  /**
   * Set exposure value in stops (EV)
   */
  setExposure(ev: number): void {
    this.options.exposure = ev;
    if (this.initialized) {
      this.render();
    }
  }

  /**
   * Set tone mapping operator
   */
  setToneMapping(operator: 'none' | 'reinhard' | 'aces'): void {
    this.options.toneMapping = operator;
    if (this.initialized) {
      this.render();
    }
  }

  /**
   * Enable/disable HDR mode
   */
  setHDRMode(enabled: boolean): void {
    this.options.hdrMode = enabled;
    if (this.initialized) {
      this.render();
    }
  }

  /**
   * Set color space for output
   */
  setColorSpace(colorSpace: 'srgb' | 'display-p3' | 'rec2020'): void {
    this.options.colorSpace = colorSpace;
    if (this.initialized) {
      this.render();
    }
  }

  /**
   * Set visualization mode
   */
  setVisualizationMode(mode: 'rgb' | 'luminance' | 'clipping'): void {
    this.options.visualizationMode = mode;
    if (this.initialized) {
      this.render();
    }
  }

  /**
   * Get current render state
   */
  getRenderState(): RenderState {
    return { ...this.options };
  }

  /**
   * Batch update render options
   */
  updateOptions(options: Partial<HDRCanvasOptions>): void {
    if (options.exposure !== undefined) this.options.exposure = options.exposure;
    if (options.toneMapping !== undefined) this.options.toneMapping = options.toneMapping;
    if (options.hdrMode !== undefined) this.options.hdrMode = options.hdrMode;
    if (options.colorSpace !== undefined) this.options.colorSpace = options.colorSpace;
    if (options.visualizationMode !== undefined)
      this.options.visualizationMode = options.visualizationMode;
    if (this.initialized) {
      this.render();
    }
  }

  // ============================================================
  // Viewport methods
  // ============================================================

  /**
   * Get current viewport state
   */
  getViewport(): ViewportState {
    return this.viewportController.getState();
  }

  /**
   * Set zoom level (instant, no animation)
   * @param zoom Zoom level (1.0 = 100%, 2.0 = 200%)
   */
  setZoom(zoom: number): void {
    this.viewportController.applyMutation({
      type: 'zoom.to',
      factor: zoom,
      duration: 0,
    });
  }

  /**
   * Set pan offset (instant, no animation)
   * @param x Pan X in normalized coordinates
   * @param y Pan Y in normalized coordinates
   */
  setPan(x: number, y: number): void {
    this.viewportController.applyMutation({
      type: 'pan.drag',
      deltaX: this.viewportController.getState().panX - x,
      deltaY: this.viewportController.getState().panY - y,
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

  /**
   * Reset viewport to default (zoom 1, no pan)
   * @param animated - Whether to animate the transition (default: true)
   */
  resetViewport(animated = true): void {
    this.viewportController.applyMutation({
      type: 'reset',
      duration: animated ? undefined : 0,
    });
  }

  /**
   * Zoom in by a factor (centered, animated)
   * @param factor - Zoom multiplier (default: 2)
   */
  zoomIn(factor?: number): void {
    this.viewportController.applyMutation({
      type: 'zoom.in',
      factor,
    });
  }

  /**
   * Zoom out by a factor (centered, animated)
   * @param factor - Zoom divisor (default: 2)
   */
  zoomOut(factor?: number): void {
    this.viewportController.applyMutation({
      type: 'zoom.out',
      factor,
    });
  }

  /**
   * Zoom to fit image in canvas (animated)
   * Shows the entire image with maximum size that fits
   */
  zoomToFit(): void {
    this.viewportController.applyMutation({
      type: 'zoom.to',
      factor: 1,
    });
  }

  /**
   * Zoom to actual size (1:1 pixel mapping, animated)
   * One image pixel = one screen pixel
   */
  zoomToActual(): void {
    const imageDims = this.renderer.getImageDimensions();
    if (imageDims.width === 0 || imageDims.height === 0) return;

    const canvasRect = this.canvas.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;

    const imageAspect = imageDims.width / imageDims.height;
    const canvasAspect = canvasRect.width / canvasRect.height;

    const fitScale =
      imageAspect > canvasAspect
        ? canvasRect.width / imageDims.width
        : canvasRect.height / imageDims.height;

    this.viewportController.applyMutation({
      type: 'zoom.to',
      factor: 1 / fitScale,
    });
  }

  /**
   * Update viewport controller configuration
   */
  setViewportConfig(config: Partial<ViewportConfig>): void {
    this.viewportController.updateConfig(config);
  }

  // ============================================================
  // Event subscriptions
  // ============================================================

  /**
   * Subscribe to zoom changes (throttled for wheel/pinch events)
   * @param callback - Called with new zoom level and full viewport state
   * @param throttleMs - Throttle interval for frequent events (default: 100ms)
   * @returns Unsubscribe function
   */
  onZoom(callback: (zoom: number, state: ViewportState) => void, throttleMs = 100): () => void {
    const throttledCallback = throttle(throttleMs, callback);

    return this.viewportController.onMutation((mutation, _prev, target) => {
      switch (mutation.type) {
        case 'zoom.in':
        case 'zoom.out':
        case 'zoom.to':
        case 'reset':
          callback(target.zoom, target);
          break;
        case 'zoom.wheel':
        case 'zoom.pinch':
          throttledCallback(target.zoom, target);
          break;
      }
    });
  }

  /**
   * Subscribe to all viewport mutations (low-level)
   * @param listener - Called with mutation details and state
   * @returns Unsubscribe function
   */
  onMutation(listener: MutationListener): () => void {
    return this.viewportController.onMutation(listener);
  }

  /**
   * Subscribe to viewport state updates (fires every animation frame)
   * @param callback - Called with current viewport state
   * @returns Unsubscribe function
   */
  onViewportChange(callback: (state: ViewportState) => void): () => void {
    return this.viewportController.onUpdate(callback);
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
    const { wheel, drag, touch, keyboard, ...viewportConfig } = options;

    // Apply viewport config
    if (Object.keys(viewportConfig).length > 0) {
      this.viewportController.updateConfig(viewportConfig);
    }

    // Parse wheel config
    const wheelEnabled = typeof wheel === 'boolean' ? wheel : (wheel?.enabled ?? true);
    const wheelSensitivity = typeof wheel === 'object' ? wheel.sensitivity : undefined;

    // Create mouse handler with config
    const mouseHandler = new MouseHandler(
      this.canvas,
      {
        onWheelZoom: (zoomDelta, cursorX, cursorY) =>
          this.viewportController.applyMutation({
            type: 'zoom.wheel',
            zoomDelta,
            cursorX,
            cursorY,
          }),
        onDragPan: (deltaX, deltaY) =>
          this.viewportController.applyMutation({
            type: 'pan.drag',
            deltaX,
            deltaY,
          }),
        onReset: () => this.viewportController.applyMutation({ type: 'reset' }),
      },
      { wheel: wheelEnabled, drag, wheelSensitivity }
    );

    // Create touch handler with config
    const touchHandler = new TouchHandler(
      this.canvas,
      {
        onPan: (deltaX, deltaY) =>
          this.viewportController.applyMutation({
            type: 'pan.drag',
            deltaX,
            deltaY,
          }),
        onPinchZoom: (scaleDelta, centerX, centerY) =>
          this.viewportController.applyMutation({
            type: 'zoom.pinch',
            scale: scaleDelta,
            cx: centerX,
            cy: centerY,
          }),
        onReset: () => this.viewportController.applyMutation({ type: 'reset' }),
      },
      { enabled: touch }
    );

    // Create keyboard handler with config
    const keyboardHandler = new KeyboardHandler(
      this.canvas,
      {
        onPan: (deltaX, deltaY) =>
          this.viewportController.applyMutation({
            type: 'pan.drag',
            deltaX,
            deltaY,
          }),
        onZoomIn: () => this.zoomIn(),
        onZoomOut: () => this.zoomOut(),
        onZoomToFit: () => this.zoomToFit(),
        onZoomToActual: () => this.zoomToActual(),
        onReset: () => this.viewportController.applyMutation({ type: 'reset', duration: 0 }),
      },
      typeof keyboard === 'boolean' ? { enabled: keyboard } : keyboard
    );

    const detachMouse = mouseHandler.attach();
    const detachTouch = touchHandler.attach();
    const detachKeyboard = keyboardHandler.attach();

    // Return cleanup function
    return () => {
      detachMouse();
      detachTouch();
      detachKeyboard();
    };
  }

  // ============================================================
  // Auto-resize
  // ============================================================

  /**
   * Enable automatic canvas resize based on CSS layout size.
   * Uses ResizeObserver to sync canvas pixel size with display size.
   * @returns Cleanup function to disable auto-resize
   */
  enableAutoResize(): () => void {
    if (this.resizeObserver) {
      return () => this.disableAutoResize();
    }

    const dpr = window.devicePixelRatio || 1;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);

        if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
          this.canvas.width = pixelWidth;
          this.canvas.height = pixelHeight;
          this.forceRender();
        }
      }
    });

    this.resizeObserver.observe(this.canvas);

    return () => this.disableAutoResize();
  }

  /**
   * Disable automatic canvas resize
   */
  disableAutoResize(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  // ============================================================
  // Rendering
  // ============================================================

  /**
   * Render with current settings
   */
  private render(): void {
    if (!this.initialized) return;

    this.renderWithViewport(this.viewportController.getState());
  }

  /**
   * Render with explicit viewport state (avoids extra getState() call)
   */
  private renderWithViewport(viewport: ViewportState): void {
    if (!this.initialized) return;

    this.renderer.render({
      exposure: this.options.exposure,
      toneMapping: this.options.toneMapping,
      visualizationMode: this.options.visualizationMode,
      hdrMode: this.options.hdrMode,
      colorSpace: this.options.colorSpace,
      viewport,
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
    this.disableAutoResize();
    this.viewportController.destroy();
    if (this.initialized) {
      this.renderer.destroy();
      this.initialized = false;
    }
  }
}
