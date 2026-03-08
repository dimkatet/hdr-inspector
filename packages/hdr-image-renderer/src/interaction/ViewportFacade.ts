/**
 * ViewportFacade - Interface for viewport-controllable objects
 *
 * Decouples interaction handlers from specific viewport implementations.
 * Any object implementing this interface can be controlled via mouse, touch, or keyboard.
 */

import type { ViewportConfig, ViewportMutation, ViewportState } from '../types';

/**
 * Interface for objects that can receive user interactions (zoom, pan, reset)
 *
 * This abstraction allows interaction handlers to work with any target
 * that implements viewport-like behavior, not just ViewportController.
 *
 * @example
 * ```typescript
 * // ViewportController implements ViewportFacade
 * const viewport = new ViewportController();
 * const interactions = new InteractionManager(canvas, viewport, getCommands);
 * interactions.attach({ wheel: true, drag: true });
 * ```
 */
export interface ViewportFacade {
  /**
   * Apply a viewport mutation (zoom, pan, or reset)
   * @param mutation - The mutation to apply with animation parameters
   */
  applyMutation(mutation: ViewportMutation): void;

  /**
   * Get current viewport state (zoom and pan)
   * @returns Current zoom and pan values
   */
  getState(): ViewportState;

  /**
   * Update viewport configuration (limits, animation settings, etc.)
   * @param config - Partial config to merge with current settings
   */
  updateConfig(config: Partial<ViewportConfig>): void;

  /**
   * Check whether the image can pan in the given direction.
   * Used by interaction handlers to decide whether to consume DOM events
   * or let them propagate to parent elements (e.g. page scroll, parent drag).
   *
   * @param deltaX - Normalized horizontal delta (same sign convention as pan mutations).
   *                 Positive = mouse/touch moved right → panX decreases.
   * @param deltaY - Normalized vertical delta. Positive = moved down → panY decreases.
   * @returns true if the image will visually move when panned in this direction.
   *          false if zoom ≤ 1 (fits in viewport) or pan is already at the edge.
   *
   * When called with no arguments (0, 0): returns true if any pan is possible (zoom > 1).
   */
  canPan(deltaX?: number, deltaY?: number): boolean;
}
