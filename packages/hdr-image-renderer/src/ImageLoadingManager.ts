/**
 * Image Loading Manager
 *
 * Manages async image loading with placeholder and error fallback support.
 * Coordinates loading state and delegates actual image upload to HDRCanvas.
 */

import type {
  ImageData,
  ImageInfo,
  ImageLoader,
  LoadingState,
  LoadingStateListener,
  LoadOptions,
} from './types';

/**
 * Manages async image loading with fallback support
 */
export class ImageLoadingManager {
  private state: LoadingState = { status: 'idle', displayedImage: 'none' };
  private stateListeners = new Set<LoadingStateListener>();
  private abortController: AbortController | null = null;

  private uploadFn: (data: ImageData) => Promise<void>;
  private getImageInfoFn: () => ImageInfo;

  constructor(
    uploadFn: (data: ImageData) => Promise<void>,
    getImageInfoFn: () => ImageInfo
  ) {
    this.uploadFn = uploadFn;
    this.getImageInfoFn = getImageInfoFn;
  }

  /**
   * Load image using a user-provided loader function.
   * Optionally shows placeholder while loading and errorFallback on failure.
   */
  async load(loader: ImageLoader, options: LoadOptions = {}): Promise<ImageInfo> {
    const { placeholder, errorFallback, timeout } = options;

    // Cancel any previous loading operation
    this.cancel();

    // Create new abort controller
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Set up timeout if specified
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeout && timeout > 0) {
      timeoutId = setTimeout(() => {
        this.abortController?.abort(new Error(`Loading timeout after ${timeout}ms`));
      }, timeout);
    }

    try {
      // Show placeholder if provided
      if (placeholder) {
        await this.uploadFn(placeholder);
        this.setState({ status: 'loading', displayedImage: 'placeholder' });
      } else {
        this.setState({ status: 'loading', displayedImage: 'none' });
      }

      // Call user's loader function
      const imageData = await loader(signal);

      // Check if cancelled
      if (signal.aborted) {
        throw signal.reason || new Error('Loading cancelled');
      }

      // Upload main image
      await this.uploadFn(imageData);
      this.setState({ status: 'success', displayedImage: 'main', error: undefined });

      return this.getImageInfoFn();
    } catch (error) {
      // Handle cancellation
      if (signal.aborted) {
        // Don't change state on explicit cancellation, just rethrow
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));

      // Show error fallback if provided
      if (errorFallback) {
        try {
          await this.uploadFn(errorFallback);
          this.setState({ status: 'error', displayedImage: 'error-fallback', error: err });
        } catch {
          // Failed to show error fallback, just set error state
          this.setState({ status: 'error', displayedImage: 'none', error: err });
        }
      } else {
        this.setState({ status: 'error', displayedImage: 'none', error: err });
      }

      throw err;
    } finally {
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.abortController = null;
    }
  }

  /**
   * Cancel current loading operation
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort(new Error('Loading cancelled'));
      this.abortController = null;
    }
  }

  /**
   * Get current loading state
   */
  getState(): LoadingState {
    return { ...this.state };
  }

  /**
   * Subscribe to loading state changes
   * @returns Unsubscribe function
   */
  onStateChange(callback: LoadingStateListener): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cancel();
    this.stateListeners.clear();
  }

  /**
   * Update state and notify listeners
   */
  private setState(newState: LoadingState): void {
    this.state = newState;
    this.emitStateChange();
  }

  /**
   * Notify all listeners of state change
   */
  private emitStateChange(): void {
    const stateCopy = { ...this.state };
    for (const listener of this.stateListeners) {
      listener(stateCopy);
    }
  }
}
