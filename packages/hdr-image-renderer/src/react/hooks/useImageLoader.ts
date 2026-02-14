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
 */
export function useImageLoader(
  instanceRef: React.RefObject<IHDRCanvas | null>,
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

  // Keep all callbacks in refs to avoid effect re-runs
  const loaderRef = useRef(loader);
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const onLoadingStateChangeRef = useRef(onLoadingStateChange);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);
  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onLoadingStateChangeRef.current = onLoadingStateChange;
  }, [onLoadingStateChange]);

  // Track loading state for async loader
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
    instanceRef.current?.loading.cancel();
  });

  // Load direct ImageData
  useEffect(() => {
    if (!image) return;

    instanceRef.current?.loading
      .upload(image)
      .then(() => {
        console.log(instanceRef.current);
        if (!instanceRef.current) return;
        const info = instanceRef.current?.control.getImageInfo();
        onLoadRef.current?.(info);
      })
      .catch((err) => {
        onErrorRef.current?.(err);
      });
  }, [image, instanceRef]);

  // Load via async loader
  useEffect(() => {
    const currentLoader = loaderRef.current;
    if (!currentLoader || !instanceRef.current) return;

    // Subscribe to state changes from ImageLoadingManager
    // const unsubscribe = instanceRef.current?.loading.onStateChange(setState);
    const unsubscribe = instanceRef.current?.on('loading:stateChange', ({ state }) =>
      setState(state)
    );

    // Start loading
    instanceRef.current?.loading
      .load(currentLoader, { placeholder, errorFallback, timeout })
      .then((info) => {
        onLoadRef.current?.(info);
      })
      .catch((error) => {
        // Don't call onError for cancellation
        if (error?.message !== 'Loading cancelled') {
          onErrorRef.current?.(error);
        }
      });

    return () => {
      unsubscribe();
      instanceRef.current?.loading.cancel();
    };
  }, [instanceRef, placeholder, errorFallback, timeout]);
  // Note: loader is accessed via ref, not in deps

  return {
    state,
    cancel: cancelRef.current,
  };
}
