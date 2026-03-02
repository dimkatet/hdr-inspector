import { useEffect, useRef, useState } from 'react';
import type { IHDRCanvas, ImageData, ImageInfo, ImageLoader, LoadingState } from '../../types';

export interface UseImageLoaderOptions {
  /** Image data to load directly (mutually exclusive with loader) */
  image?: ImageData;
  /** Async loader function (mutually exclusive with image) */
  loader?: ImageLoader;
  /** Placeholder image while loading */
  placeholder?: ImageData;
  /** Error fallback image */
  errorFallback?: ImageData;
  /** Timeout in ms */
  timeout?: number;
  /** Callback on successful load */
  onLoad?: (info: ImageInfo) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback on loading state change (only for async loader) */
  onLoadingStateChange?: (state: LoadingState) => void;
}

export interface UseImageLoaderResult {
  /** Current loading state (only meaningful when using loader) */
  state: LoadingState;
  /** Cancel current loading operation */
  cancel: () => void;
}

// Re-export ImageInfo for convenience
export type { ImageInfo } from '../../types';

const IDLE_STATE: LoadingState = { status: 'idle', displayedImage: 'none' };

/**
 * Hook for loading images into HDRCanvas.
 * Supports both direct ImageData and async loader function.
 *
 * Automatically loads when `instance` transitions from null → object.
 */
export function useImageLoader(
  instance: IHDRCanvas | null,
  options: UseImageLoaderOptions
): UseImageLoaderResult {
  const {
    image,
    loader,
    placeholder,
    errorFallback,
    timeout,
    onLoad,
    onError,
    onLoadingStateChange,
  } = options;

  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const onLoadingStateChangeRef = useRef(onLoadingStateChange);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onLoadingStateChangeRef.current = onLoadingStateChange;
  }, [onLoadingStateChange]);

  const [state, setState] = useState<LoadingState>(IDLE_STATE);

  // Notify parent of state changes
  const prevStateRef = useRef(state);
  useEffect(() => {
    if (state !== prevStateRef.current) {
      prevStateRef.current = state;
      onLoadingStateChangeRef.current?.(state);
    }
  }, [state]);

  // Cancel function
  const cancelRef = useRef(() => {
    instance?.loading.cancel();
  });
  useEffect(() => {
    cancelRef.current = () => instance?.loading.cancel();
  }, [instance]);

  // Load direct ImageData
  useEffect(() => {
    console.log('Starting image load with direct ImageData:', image, 'Instance:', instance);
    if (!image || !instance) return;
    console.log('Starting image load with direct ImageData:', image);
    instance.loading
      .upload(image)
      .then(() => {
        if (!instance) return;
        const info = instance.control.getImageInfo();
        onLoadRef.current?.(info);
      })
      .catch((err) => {
        onErrorRef.current?.(err);
      });
  }, [image, instance]);

  // Load via async loader — re-runs when loader identity changes (new photo, etc.)
  useEffect(() => {
    if (!loader || !instance) return;

    const unsubscribe = instance.on('loading:stateChange', ({ state }) => setState(state));

    instance.loading
      .load(loader, { placeholder, errorFallback, timeout })
      .then((info) => {
        onLoadRef.current?.(info);
      })
      .catch((error) => {
        if (error?.message !== 'Loading cancelled') {
          onErrorRef.current?.(error);
        }
      });

    return () => {
      unsubscribe();
      try {
        instance.loading.cancel();
      } catch {
        /* instance may be destroyed */
      }
    };
  }, [instance, loader, placeholder, errorFallback, timeout]);

  return {
    state,
    cancel: cancelRef.current,
  };
}
