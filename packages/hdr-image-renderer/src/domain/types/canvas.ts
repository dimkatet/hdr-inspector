/**
 * Canvas Domain Types
 *
 * Types for canvas-specific operations and control
 */

import type { ImageInfo } from './image';

/**
 * Canvas control API
 * Canvas-specific operations (auto-resize, image info, etc.)
 */
export interface CanvasAPI {
  /** Enable automatic canvas resize based on CSS layout (returns cleanup function) */
  enableAutoResize(): () => void;
  /** Disable automatic canvas resize */
  disableAutoResize(): void;
  /** Get loaded image dimensions */
  getImageDimensions(): { width: number; height: number };
  /** Get loaded image info (dimensions + aspect ratio) */
  getImageInfo(): ImageInfo;
  /** Force re-render (e.g., after manual canvas resize) */
  forceRender(): void;
}
