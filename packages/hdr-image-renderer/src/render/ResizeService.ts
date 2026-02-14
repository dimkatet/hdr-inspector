/**
 * ResizeService - Interface for canvas auto-resize handling
 *
 * Abstracts canvas resize observation from specific implementations.
 */

/**
 * Interface for canvas resize services
 */
export interface ResizeService {
  /** Enable automatic canvas resize, returns cleanup function */
  enable(): () => void;
  /** Disable automatic canvas resize */
  disable(): void;
}
