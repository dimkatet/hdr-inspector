/**
 * ViewportController - Platform-agnostic zoom/pan logic
 *
 * Handles viewport state management, animation, and input processing.
 * Can be used standalone or integrated into HDRCanvas.
 */

import type { ViewportState, ViewportConfig } from '../types'

const DEFAULT_CONFIG: Required<ViewportConfig> = {
  minZoom: 0.1,
  maxZoom: 10,
  wheelSensitivity: 0.001,
  animationSpeed: 0.15,
}

/**
 * Clamp pan values to keep image within viewport bounds.
 * At zoom 1, no pan is allowed (image fills viewport).
 * At zoom > 1, pan is limited so image edges don't go past viewport center.
 */
function clampPan(pan: number, zoom: number): number {
  const maxPan = Math.max(0, (1 - 1 / zoom) / 2)
  return Math.max(-maxPan, Math.min(maxPan, pan))
}

export class ViewportController {
  private state: ViewportState = { zoom: 1, panX: 0, panY: 0 }
  private target: ViewportState = { zoom: 1, panX: 0, panY: 0 }
  private animationId: number | null = null
  private config: Required<ViewportConfig>
  private onUpdate: ((state: ViewportState) => void) | null = null

  constructor(config: Partial<ViewportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get current viewport state
   */
  getState(): ViewportState {
    return { ...this.state }
  }

  /**
   * Get target viewport state (where animation is heading)
   */
  getTarget(): ViewportState {
    return { ...this.target }
  }

  /**
   * Set viewport state directly (no animation)
   */
  setState(viewport: Partial<ViewportState>): void {
    if (viewport.zoom !== undefined) {
      const zoom = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, viewport.zoom))
      this.state.zoom = zoom
      this.target.zoom = zoom
    }
    if (viewport.panX !== undefined) {
      this.state.panX = clampPan(viewport.panX, this.state.zoom)
      this.target.panX = this.state.panX
    }
    if (viewport.panY !== undefined) {
      this.state.panY = clampPan(viewport.panY, this.state.zoom)
      this.target.panY = this.state.panY
    }
    this.onUpdate?.(this.state)
  }

  /**
   * Reset viewport to default (zoom 1, no pan)
   */
  reset(): void {
    this.state = { zoom: 1, panX: 0, panY: 0 }
    this.target = { zoom: 1, panX: 0, panY: 0 }
    this.stopAnimation()
    this.onUpdate?.(this.state)
  }

  /**
   * Reset with animation
   */
  resetAnimated(): void {
    this.target = { zoom: 1, panX: 0, panY: 0 }
    this.startAnimation()
  }

  /**
   * Apply wheel zoom centered on cursor position
   * @param deltaY - Wheel delta (negative = zoom in)
   * @param cursorX - Cursor X in normalized canvas coords [0, 1]
   * @param cursorY - Cursor Y in normalized canvas coords [0, 1]
   */
  applyWheelZoom(deltaY: number, cursorX: number, cursorY: number): void {
    const zoomDelta = -deltaY * this.config.wheelSensitivity
    const prevTarget = this.target
    const newZoom = Math.max(
      this.config.minZoom,
      Math.min(this.config.maxZoom, prevTarget.zoom * (1 + zoomDelta))
    )

    // Zoom toward cursor position
    const zoomRatio = newZoom / prevTarget.zoom

    // Mouse position relative to image center (in UV space)
    const mouseOffsetX = cursorX - 0.5
    const mouseOffsetY = cursorY - 0.5

    // Adjust pan to keep the point under cursor stationary
    const newPanX = prevTarget.panX + (mouseOffsetX * (1 - 1 / zoomRatio)) / newZoom
    const newPanY = prevTarget.panY + (mouseOffsetY * (1 - 1 / zoomRatio)) / newZoom

    this.target = {
      zoom: newZoom,
      panX: clampPan(newPanX, newZoom),
      panY: clampPan(newPanY, newZoom),
    }

    this.startAnimation()
  }

  /**
   * Apply drag pan
   * @param deltaX - Delta X in normalized canvas coords (positive = pan right)
   * @param deltaY - Delta Y in normalized canvas coords (positive = pan down)
   */
  applyDragPan(deltaX: number, deltaY: number): void {
    // Pan is in image space, so divide by zoom
    const newPanX = this.state.panX - deltaX / this.state.zoom
    const newPanY = this.state.panY - deltaY / this.state.zoom

    this.state = {
      ...this.state,
      panX: clampPan(newPanX, this.state.zoom),
      panY: clampPan(newPanY, this.state.zoom),
    }
    // Sync target with current state during drag (no animation)
    this.target = { ...this.state }

    this.onUpdate?.(this.state)
  }

  /**
   * Set callback for viewport updates
   */
  setUpdateCallback(callback: ((state: ViewportState) => void) | null): void {
    this.onUpdate = callback
  }

  /**
   * Start animation loop
   */
  private startAnimation(): void {
    if (this.animationId !== null) return

    const animate = () => {
      const t = this.config.animationSpeed

      // Check if we're close enough to stop
      const dZoom = Math.abs(this.target.zoom - this.state.zoom)
      const dPanX = Math.abs(this.target.panX - this.state.panX)
      const dPanY = Math.abs(this.target.panY - this.state.panY)

      if (dZoom < 0.001 && dPanX < 0.0001 && dPanY < 0.0001) {
        this.state = { ...this.target }
        this.animationId = null
        this.onUpdate?.(this.state)
        return
      }

      // Lerp toward target
      const newZoom = this.state.zoom + (this.target.zoom - this.state.zoom) * t
      const newPanX = this.state.panX + (this.target.panX - this.state.panX) * t
      const newPanY = this.state.panY + (this.target.panY - this.state.panY) * t

      this.state = {
        zoom: newZoom,
        panX: clampPan(newPanX, newZoom),
        panY: clampPan(newPanY, newZoom),
      }

      this.onUpdate?.(this.state)
      this.animationId = requestAnimationFrame(animate)
    }

    this.animationId = requestAnimationFrame(animate)
  }

  /**
   * Stop animation
   */
  stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /**
   * Check if animation is running
   */
  isAnimating(): boolean {
    return this.animationId !== null
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<ViewportConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAnimation()
    this.onUpdate = null
  }
}
