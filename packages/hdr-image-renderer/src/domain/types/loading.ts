/**
 * Loading Domain Types
 *
 * Types for async image loading with placeholder and error handling
 */

import type { ImageData, ImageInfo } from './image';

/**
 * Image loader function
 * User-provided function that loads and decodes image data.
 * Receives an AbortSignal for cancellation support.
 */
export type ImageLoader = (signal?: AbortSignal) => Promise<ImageData>;

/**
 * Options for async image loading
 */
export interface LoadOptions {
  /** Image to display while loading (placeholder) */
  placeholder?: ImageData;
  /** Image to display if loading fails (error fallback) */
  errorFallback?: ImageData;
  /** Timeout in milliseconds (rejects if exceeded) */
  timeout?: number;
}

/**
 * Type of image currently displayed
 */
export type DisplayedImageType = 'none' | 'placeholder' | 'main' | 'error-fallback';

/**
 * Loading state for async image operations
 */
export interface LoadingState {
  /** Current loading status */
  status: 'idle' | 'loading' | 'success' | 'error';
  /** Error if status is 'error' */
  error?: Error;
  /** Which image is currently displayed */
  displayedImage: DisplayedImageType;
}

/**
 * Listener for loading state changes
 */
export type LoadingStateListener = (state: LoadingState) => void;

/**
 * Image loading API
 * Manages async image loading with placeholder and error fallback support
 */
export interface LoadingAPI {
  /**
   * Upload image data directly (no placeholder/fallback support)
   * @param data - ImageData to upload (LinearImageData or EncodedImageData)
   * @returns Promise that resolves with ImageInfo on success
   */
  upload(data: ImageData): Promise<ImageInfo>;

  /**
   * Load image using a user-provided loader function.
   * Optionally shows placeholder while loading and errorFallback on failure.
   * @param loader - Function that returns Promise<ImageData>
   * @param options - Loading options (placeholder, errorFallback, timeout)
   * @returns Promise that resolves with ImageInfo on success
   */
  load(loader: ImageLoader, options?: LoadOptions): Promise<ImageInfo>;

  /** Cancel current loading operation */
  cancel(): void;

  /** Get current loading state */
  getState(): LoadingState;

  // /** Subscribe to loading state changes (returns unsubscribe function) */
  // onStateChange(callback: LoadingStateListener): () => void;
}
