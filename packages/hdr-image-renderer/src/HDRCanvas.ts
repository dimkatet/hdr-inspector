/**
 * HDRCanvas - Main API
 *
 * High-level interface for rendering HDR images with WebGPU.
 * Wraps WebGPURenderer with a simple imperative API.
 */

import type { HDRCanvasOptions, RenderState, LinearImageData, ViewportState, ViewportConfig, ImageInfo, InteractionOptions } from './types'
import { decodeRadianceHDR } from './decoders'
import { WebGPURenderer } from './renderer'
import { ViewportController } from './core/ViewportController'
import { InteractionHandler } from './core/InteractionHandler'

export class HDRCanvas {
  private canvas: HTMLCanvasElement
  private options: Required<HDRCanvasOptions>
  private renderer: WebGPURenderer
  private initialized: boolean = false
  private viewportController: ViewportController
  private resizeObserver: ResizeObserver | null = null

  constructor(canvas: HTMLCanvasElement, options: HDRCanvasOptions = {}) {
    this.canvas = canvas
    this.options = {
      hdrMode: options.hdrMode ?? false,
      exposure: options.exposure ?? 0,
      toneMapping: options.toneMapping ?? 'aces',
      colorSpace: options.colorSpace ?? 'display-p3',
      visualizationMode: options.visualizationMode ?? 'rgb',
      transparent: options.transparent ?? false
    }

    this.renderer = new WebGPURenderer(canvas, { transparent: this.options.transparent })
    this.viewportController = new ViewportController()
    this.viewportController.setUpdateCallback(() => this.render())
  }

  /**
   * Initialize WebGPU context (must be called before loading images)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    await this.renderer.initialize()
    this.initialized = true
  }

  /**
   * Load image from LinearImageData
   */
  async loadImage(data: LinearImageData): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    this.renderer.uploadImage(data)
    this.render()
  }

  /**
   * Load Radiance HDR file from ArrayBuffer
   */
  async loadRadianceHDR(buffer: ArrayBuffer): Promise<void> {
    const imageData = decodeRadianceHDR(buffer)
    return this.loadImage(imageData)
  }

  /**
   * Load file with auto-detection of format
   */
  async loadFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer()
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'hdr' || ext === 'pic') {
      return this.loadRadianceHDR(buffer)
    }

    throw new Error(`Unsupported file format: ${ext}`)
  }

  /**
   * Set exposure value in stops (EV)
   */
  setExposure(ev: number): void {
    this.options.exposure = ev
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Set tone mapping operator
   */
  setToneMapping(operator: 'none' | 'reinhard' | 'aces'): void {
    this.options.toneMapping = operator
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Enable/disable HDR mode
   */
  setHDRMode(enabled: boolean): void {
    this.options.hdrMode = enabled
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Set color space for output
   */
  setColorSpace(colorSpace: 'srgb' | 'display-p3' | 'rec2020'): void {
    this.options.colorSpace = colorSpace
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Set visualization mode
   */
  setVisualizationMode(mode: 'rgb' | 'luminance' | 'clipping'): void {
    this.options.visualizationMode = mode
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Get current render state
   */
  getRenderState(): RenderState {
    return { ...this.options }
  }

  /**
   * Batch update render options
   */
  updateOptions(options: Partial<HDRCanvasOptions>): void {
    if (options.exposure !== undefined) this.options.exposure = options.exposure
    if (options.toneMapping !== undefined) this.options.toneMapping = options.toneMapping
    if (options.hdrMode !== undefined) this.options.hdrMode = options.hdrMode
    if (options.colorSpace !== undefined) this.options.colorSpace = options.colorSpace
    if (options.visualizationMode !== undefined) this.options.visualizationMode = options.visualizationMode
    if (this.initialized) {
      this.render()
    }
  }

  // ============================================================
  // Viewport methods
  // ============================================================

  /**
   * Get current viewport state
   */
  getViewport(): ViewportState {
    return this.viewportController.getState()
  }

  /**
   * Set zoom level
   * @param zoom Zoom level (1.0 = 100%, 2.0 = 200%)
   */
  setZoom(zoom: number): void {
    this.viewportController.setState({ zoom })
  }

  /**
   * Set pan offset
   * @param x Pan X in normalized coordinates
   * @param y Pan Y in normalized coordinates
   */
  setPan(x: number, y: number): void {
    this.viewportController.setState({ panX: x, panY: y })
  }

  /**
   * Set complete viewport state
   */
  setViewport(viewport: Partial<ViewportState>): void {
    this.viewportController.setState(viewport)
  }

  /**
   * Reset viewport to default (zoom 1, no pan)
   */
  resetViewport(): void {
    this.viewportController.reset()
  }

  /**
   * Reset viewport with smooth animation
   */
  resetViewportAnimated(): void {
    this.viewportController.resetAnimated()
  }

  /**
   * Zoom in by a factor (centered, animated)
   * @param factor - Zoom multiplier (default: 2)
   */
  zoomIn(factor?: number): void {
    this.viewportController.zoomIn(factor)
  }

  /**
   * Zoom out by a factor (centered, animated)
   * @param factor - Zoom divisor (default: 2)
   */
  zoomOut(factor?: number): void {
    this.viewportController.zoomOut(factor)
  }

  /**
   * Zoom to fit image in canvas (animated)
   * Shows the entire image with maximum size that fits
   */
  zoomToFit(): void {
    // At zoom=1, shader does contain fit, so zoom=1 always shows full image
    this.viewportController.zoomTo(1)
  }

  /**
   * Zoom to actual size (1:1 pixel mapping, animated)
   * One image pixel = one screen pixel
   */
  zoomToActual(): void {
    const imageDims = this.renderer.getImageDimensions()
    if (imageDims.width === 0 || imageDims.height === 0) return

    const canvasRect = this.canvas.getBoundingClientRect()
    if (canvasRect.width === 0 || canvasRect.height === 0) return

    // At zoom=1, image is fit to canvas (contain mode)
    // We need to calculate what zoom shows 1:1 pixels
    // The contain transform scales image to fit, so we need to invert that
    const imageAspect = imageDims.width / imageDims.height
    const canvasAspect = canvasRect.width / canvasRect.height

    const fitScale = imageAspect > canvasAspect
      ? canvasRect.width / imageDims.width   // Image is wider
      : canvasRect.height / imageDims.height // Image is taller

    // zoom = 1 / fitScale gives us 1:1 pixel mapping
    this.viewportController.zoomTo(1 / fitScale)
  }

  /**
   * Apply wheel zoom centered on cursor position
   * @param deltaY - Wheel delta (negative = zoom in)
   * @param cursorNormX - Cursor X in normalized canvas coords [0, 1]
   * @param cursorNormY - Cursor Y in normalized canvas coords [0, 1]
   */
  applyWheelZoom(deltaY: number, cursorNormX: number, cursorNormY: number): void {
    this.viewportController.applyWheelZoom(deltaY, cursorNormX, cursorNormY)
  }

  /**
   * Apply drag pan
   * @param deltaNormX - Delta X in normalized canvas coords
   * @param deltaNormY - Delta Y in normalized canvas coords
   */
  applyDragPan(deltaNormX: number, deltaNormY: number): void {
    this.viewportController.applyDragPan(deltaNormX, deltaNormY)
  }

  /**
   * Update viewport controller configuration
   */
  setViewportConfig(config: Partial<ViewportConfig>): void {
    this.viewportController.updateConfig(config)
  }

  // ============================================================
  // Interactions
  // ============================================================

  /**
   * Attach mouse/wheel interactions for zoom and pan.
   * @param options - Interaction options including viewport config and callbacks
   * @returns Cleanup function to detach all listeners
   */
  attachInteractions(options: InteractionOptions = {}): () => void {
    const { onViewportChange, onAnimationEnd, ...viewportConfig } = options

    // Apply viewport config
    if (Object.keys(viewportConfig).length > 0) {
      this.viewportController.updateConfig(viewportConfig)
    }

    // Set up viewport change callback
    const originalUpdateCallback = this.viewportController['onUpdate']
    this.viewportController.setUpdateCallback((state) => {
      this.renderWithViewport(state)
      onViewportChange?.(state)
    })

    // Set up animation end callback
    const originalAnimationEndCallback = this.viewportController['onAnimationEnd']
    if (onAnimationEnd) {
      this.viewportController.setAnimationEndCallback(onAnimationEnd)
    }

    // Create interaction handler
    const handler = new InteractionHandler(this.canvas, {
      onWheelZoom: (deltaY, cursorX, cursorY) =>
        this.viewportController.applyWheelZoom(deltaY, cursorX, cursorY),
      onDragPan: (deltaX, deltaY) =>
        this.viewportController.applyDragPan(deltaX, deltaY),
      onReset: () => this.viewportController.resetAnimated(),
      onPinchZoom: (scaleDelta, centerX, centerY) =>
        this.viewportController.applyPinchZoom(scaleDelta, centerX, centerY),
    })

    const detach = handler.attach()

    // Return cleanup function
    return () => {
      detach()
      this.viewportController.setUpdateCallback(originalUpdateCallback)
      this.viewportController.setAnimationEndCallback(originalAnimationEndCallback)
    }
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
      return () => this.disableAutoResize()
    }

    const dpr = window.devicePixelRatio || 1

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const pixelWidth = Math.round(width * dpr)
        const pixelHeight = Math.round(height * dpr)

        if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
          this.canvas.width = pixelWidth
          this.canvas.height = pixelHeight
          this.forceRender()
        }
      }
    })

    this.resizeObserver.observe(this.canvas)

    return () => this.disableAutoResize()
  }

  /**
   * Disable automatic canvas resize
   */
  disableAutoResize(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
  }

  // ============================================================
  // Rendering
  // ============================================================

  /**
   * Render with current settings
   */
  private render(): void {
    if (!this.initialized) return

    this.renderWithViewport(this.viewportController.getState())
  }

  /**
   * Render with explicit viewport state (avoids extra getState() call)
   */
  private renderWithViewport(viewport: ViewportState): void {
    if (!this.initialized) return

    this.renderer.render({
      exposure: this.options.exposure,
      toneMapping: this.options.toneMapping,
      visualizationMode: this.options.visualizationMode,
      hdrMode: this.options.hdrMode,
      colorSpace: this.options.colorSpace,
      viewport
    })
  }

  /**
   * Force re-render (e.g., after canvas resize)
   */
  forceRender(): void {
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Get loaded image dimensions
   */
  getImageDimensions(): { width: number; height: number } {
    return this.renderer.getImageDimensions()
  }

  /**
   * Get loaded image info (dimensions + aspect ratio)
   */
  getImageInfo(): ImageInfo {
    const dims = this.renderer.getImageDimensions()
    return {
      width: dims.width,
      height: dims.height,
      aspectRatio: dims.width / dims.height
    }
  }

  /**
   * Cleanup GPU resources
   */
  destroy(): void {
    this.disableAutoResize()
    this.viewportController.destroy()
    if (this.initialized) {
      this.renderer.destroy()
      this.initialized = false
    }
  }
}
