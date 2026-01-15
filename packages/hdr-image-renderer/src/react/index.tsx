// React component wrapper
// Thin wrapper around HDRCanvas class with composable hooks

import { useState, useCallback } from "react";
import type { HDRCanvasOptions, LinearImageData } from "../types";
import {
  useHDRCanvas,
  useImageLoader,
  useRenderOptions,
  useViewport,
  type UseViewportOptions,
  type ImageInfo,
} from "./hooks";

export interface HDRImageProps
  extends Omit<
    React.CanvasHTMLAttributes<HTMLCanvasElement>,
    "onLoad" | "onError"
  > {
  /** Image data or file to display */
  image?: LinearImageData | File;
  /** Render options (exposure, toneMapping, etc.) */
  options: HDRCanvasOptions;
  /** Callback when image loads successfully with image info */
  onLoad?: (info: ImageInfo) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Enable zoom/pan interactions */
  zoomable?: boolean | UseViewportOptions;
  /** Auto-adjust canvas aspect ratio to match loaded image */
  fitToImage?: boolean;
}

export function HDRImage({
  image,
  options,
  onLoad,
  onError,
  zoomable = false,
  fitToImage = false,
  className,
  style,
  ...rest
}: HDRImageProps) {
  const [aspectRatio, setAspectRatio] = useState<number | undefined>();

  // Initialize HDRCanvas instance
  const { canvasRef, instanceRef } = useHDRCanvas(options, onError);

  // Handle image load with aspect ratio extraction
  const handleLoad = useCallback(
    (info: ImageInfo) => {
      if (fitToImage) {
        setAspectRatio(info.aspectRatio);
      }
      onLoad?.(info);
    },
    [fitToImage, onLoad]
  );

  // Load image when it changes
  useImageLoader(instanceRef, image, { onLoad: handleLoad, onError });

  // Sync render options
  useRenderOptions(instanceRef, options);

  // Setup zoom/pan if enabled
  const viewportOptions: UseViewportOptions =
    typeof zoomable === "boolean" ? { enabled: zoomable } : zoomable;

  const { handlers } = useViewport(instanceRef, canvasRef, viewportOptions);

  // Build canvas style
  const canvasStyle: React.CSSProperties = {
    ...style,
    cursor: viewportOptions.enabled ? "grab" : undefined,
    aspectRatio: fitToImage ? aspectRatio : style?.aspectRatio,
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={canvasStyle}
      {...(viewportOptions.enabled ? handlers : {})}
      {...rest}
    />
  );
}

export { type UseViewportOptions, type UseViewportResult, type ImageInfo } from "./hooks";
