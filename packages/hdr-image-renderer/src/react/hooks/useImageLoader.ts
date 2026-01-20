import { useEffect, useRef } from 'react';
import type { HDRCanvas } from '../../HDRCanvas';
import type { ImageData, ImageInfo } from '../../types';

export interface UseImageLoaderOptions {
  onLoad?: (info: ImageInfo) => void;
  onError?: (error: Error) => void;
}

// Re-export ImageInfo for convenience
export type { ImageInfo } from '../../types';

/**
 * Hook for loading images into HDRCanvas.
 * Handles ImageData (LinearImageData or EncodedImageData).
 */
export function useImageLoader(
  instanceRef: React.RefObject<HDRCanvas | null>,
  image: ImageData | undefined,
  options: UseImageLoaderOptions
): void {
  const { onLoad, onError } = options;
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!image || !instanceRef.current) return;
    console.log('[useImageLoader] Loading image:', image);
    const instance = instanceRef.current;
    const onLoad = onLoadRef.current;
    const onError = onErrorRef.current;

    instance
      .loadImage(image)
      .then(() => {
        const info = instance.control.getImageInfo();
        onLoad?.(info);
      })
      .catch(onError);
  }, [image, instanceRef]);
}
