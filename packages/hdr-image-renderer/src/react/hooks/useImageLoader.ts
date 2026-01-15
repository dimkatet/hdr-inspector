import { useEffect } from "react";
import type { HDRCanvas } from "../../HDRCanvas";
import type { LinearImageData, ImageInfo } from "../../types";

export interface UseImageLoaderOptions {
  onLoad?: (info: ImageInfo) => void;
  onError?: (error: Error) => void;
}

// Re-export ImageInfo for convenience
export type { ImageInfo } from "../../types";

/**
 * Hook for loading images into HDRCanvas.
 * Handles both LinearImageData and File inputs.
 */
export function useImageLoader(
  instanceRef: React.RefObject<HDRCanvas | null>,
  image: LinearImageData | File | undefined,
  options: UseImageLoaderOptions
): void {
  const { onLoad, onError } = options;

  useEffect(() => {
    if (!image || !instanceRef.current) return;

    const instance = instanceRef.current;

    const loadPromise =
      image instanceof File
        ? instance.loadFile(image)
        : instance.loadImage(image);

    loadPromise
      .then(() => {
        const dimensions = instance.getImageDimensions();
        onLoad?.({
          width: dimensions.width,
          height: dimensions.height,
          aspectRatio: dimensions.width / dimensions.height,
        });
      })
      .catch(onError);
  }, [image, onLoad, onError, instanceRef]);
}
