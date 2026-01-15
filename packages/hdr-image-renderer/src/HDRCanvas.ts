/**
 * HDRCanvas - Main API
 *
 * High-level interface for rendering HDR images with WebGPU.
 * Wraps WebGPURenderer with a simple imperative API.
 */

import type { HDRCanvasOptions, RenderState, LinearImageData, ViewportState } from './types'
import { decodeRadianceHDR } from './decoders'
import { WebGPURenderer } from './renderer'

export class HDRCanvas {
  private canvas: HTMLCanvasElement
  private options: Required<HDRCanvasOptions>
  private renderer: WebGPURenderer
  private initialized: boolean = false
  private viewport: ViewportState = { zoom: 1, panX: 0, panY: 0 }

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
   * Get current viewport state
   */
  getViewport(): ViewportState {
    return { ...this.viewport }
  }

  /**
   * Set zoom level
   * @param zoom Zoom level (1.0 = 100%, 2.0 = 200%)
   */
  setZoom(zoom: number): void {
    this.viewport.zoom = Math.max(0.1, Math.min(10, zoom))
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Set pan offset
   * @param x Pan X in normalized coordinates
   * @param y Pan Y in normalized coordinates
   */
  setPan(x: number, y: number): void {
    this.viewport.panX = x
    this.viewport.panY = y
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Set complete viewport state
   */
  setViewport(viewport: Partial<ViewportState>): void {
    if (viewport.zoom !== undefined) {
      this.viewport.zoom = Math.max(0.1, Math.min(10, viewport.zoom))
    }
    if (viewport.panX !== undefined) {
      this.viewport.panX = viewport.panX
    }
    if (viewport.panY !== undefined) {
      this.viewport.panY = viewport.panY
    }
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Reset viewport to default (zoom 1, no pan)
   */
  resetViewport(): void {
    this.viewport = { zoom: 1, panX: 0, panY: 0 }
    if (this.initialized) {
      this.render()
    }
  }

  /**
   * Render with current settings
   */
  private render(): void {
    this.renderer.render({
      exposure: this.options.exposure,
      toneMapping: this.options.toneMapping,
      visualizationMode: this.options.visualizationMode,
      hdrMode: this.options.hdrMode,
      colorSpace: this.options.colorSpace,
      viewport: this.viewport
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
   * Cleanup GPU resources
   */
  destroy(): void {
    if (this.initialized) {
      this.renderer.destroy()
      this.initialized = false
    }
  }
}
