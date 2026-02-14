/**
 * InteractionTarget - Interface for interaction-capable objects
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
 * // ViewportController implements InteractionTarget
 * const viewport = new ViewportController();
 * const interactions = new InteractionManager(canvas, viewport, getCommands);
 * interactions.attach({ wheel: true, drag: true });
 * ```
 */
export interface InteractionTarget {
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
}
