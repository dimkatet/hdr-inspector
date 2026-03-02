/**
 * Image Loading Manager
 *
 * Manages async image loading with placeholder and error fallback support.
 * Coordinates loading state and delegates actual image upload to HDRCanvas.
 */

import type { DomainEventMap } from './core/EventTypes';
import type { RuntimeContext, RuntimeService } from './core/RuntimeService';
import type { TypedEventBus } from './core/TypedEventBus';
import type { ImageUploadService } from './ImageUploadService';
import type {
  ImageData,
  ImageInfo,
  ImageLoader,
  LoadingAPI,
  LoadingState,
  LoadOptions,
} from './types';

/**
 * Manages async image loading with fallback support
 */
export class ImageLoadingManager implements LoadingAPI, RuntimeService {
  private state: LoadingState = { status: 'idle', displayedImage: 'none' };
  private abortController: AbortController | null = null;
  runtimeSignal: AbortSignal | null = null;

  constructor(
    private uploadService: ImageUploadService,
    private eventBus?: TypedEventBus<DomainEventMap>
  ) {}

  // ============================================================
  // RuntimeService implementation
  // ============================================================

  async init(ctx: RuntimeContext): Promise<void> {
    this.runtimeSignal = ctx.signal;
  }

  start(): void {
    // no-op
  }

  stop(): void {
    this.cancel();
  }

  dispose(): void {
    this.cancel();
    this.runtimeSignal = null;
  }

  /**
   * Upload image data directly (synchronous path, no placeholder/fallback)
   */
  async upload(data: ImageData): Promise<ImageInfo> {
    // Cancel any previous loading operation
    this.cancel();

    try {
      this.setState({ status: 'loading', displayedImage: 'none' });

      const info = await this.uploadService.upload(data);
      this.eventBus?.emit('loading:imageReady', { info });
      this.setState({ status: 'success', displayedImage: 'main', error: undefined });

      return info;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setState({ status: 'error', displayedImage: 'none', error: err });
      throw err;
    }
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
        await this.uploadService.upload(placeholder);
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
      const info = await this.uploadService.upload(imageData);
      this.eventBus?.emit('loading:imageReady', { info });
      this.setState({ status: 'success', displayedImage: 'main', error: undefined });

      return info;
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
          await this.uploadService.upload(errorFallback);
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
   * Update state and notify listeners
   */
  private setState(newState: LoadingState): void {
    this.state = newState;
    this.emitStateChange();
  }

  /**
   * Emit loading state change event via EventBus
   */
  private emitStateChange(): void {
    this.eventBus?.emit('loading:stateChange', {
      state: this.state,
      type: this.state.displayedImage,
    });
  }
}
