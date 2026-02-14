/**
 * Interaction Domain Types
 *
 * Types for mouse, touch, and keyboard interaction configuration
 */

import type { ViewportConfig } from './viewport';

/**
 * Configuration for wheel zoom
 */
export interface WheelConfig {
  /** Enable wheel zoom (default: true) */
  enabled?: boolean;
  /** Wheel zoom sensitivity (default: 0.001) */
  sensitivity?: number;
}

/**
 * Configuration for mouse interactions
 */
export interface MouseConfig {
  /** Enable/configure mouse wheel zoom (true for defaults, object for custom config) */
  wheel?: boolean | WheelConfig;
  /** Enable mouse drag pan (default: true) */
  drag?: boolean;
}

/**
 * Configuration for touch interactions
 */
export interface TouchConfig {
  /** Enable touch gestures (pinch, pan, double-tap) (default: true) */
  enabled?: boolean;
}

/**
 * Configuration for keyboard controls
 */
export interface KeyboardConfig {
  /** Enable keyboard controls (default: true) */
  enabled?: boolean;
  /** Keys for pan up (default: ['ArrowUp', 'w', 'W']) */
  panUp?: string | string[];
  /** Keys for pan down (default: ['ArrowDown', 's', 'S']) */
  panDown?: string | string[];
  /** Keys for pan left (default: ['ArrowLeft', 'a', 'A']) */
  panLeft?: string | string[];
  /** Keys for pan right (default: ['ArrowRight', 'd', 'D']) */
  panRight?: string | string[];
  /** Keys for zoom in (default: ['+', '=']) */
  zoomIn?: string | string[];
  /** Keys for zoom out (default: ['-', '_']) */
  zoomOut?: string | string[];
  /** Keys for zoom to fit (default: ['0']) */
  zoomToFit?: string | string[];
  /** Keys for zoom to actual (default: ['1']) */
  zoomToActual?: string | string[];
  /** Keys for reset viewport (default: ['r', 'R']) */
  reset?: string | string[];
  /** Pan step size in normalized units (default: 0.1 = 10% of canvas) */
  panStep?: number;
}

/**
 * Options for attachInteractions()
 */
export interface InteractionOptions extends ViewportConfig {
  /** Enable/configure mouse wheel zoom (true for defaults, object for custom config) */
  wheel?: boolean | WheelConfig;
  /** Enable mouse drag pan (default: true) */
  drag?: boolean;
  /** Enable touch gestures (default: true) */
  touch?: boolean;
  /** Keyboard control configuration (true for defaults, object for custom config) */
  keyboard?: boolean | KeyboardConfig;
}

/**
 * Interaction management API
 * Handles mouse, touch, and keyboard interactions
 */
export interface InteractionAPI {
  /** Attach interaction handlers (wheel, drag, touch, keyboard) and return cleanup function */
  attach(options?: InteractionOptions): () => void;
  /** Detach all interaction handlers */
  detach(): void;
}
