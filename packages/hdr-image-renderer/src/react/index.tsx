// React component wrapper
// Thin wrapper around HDRCanvas class with composable hooks

import { useState, useCallback, forwardRef, useImperativeHandle } from "react";
import type { HDRCanvasOptions, LinearImageData, ViewportState } from "../types";
import {
  useHDRCanvas,
  useImageLoader,
  useRenderOptions,
  useViewport,
  type UseViewportOptions,
  type ImageInfo,
} from "./hooks";

/**
 * Imperative handle exposed via ref
 */
export interface HDRImageHandle {
  /** Zoom in by factor (default: 2x) */
  zoomIn: (factor?: number) => void;
  /** Zoom out by factor (default: 2x) */
  zoomOut: (factor?: number) => void;
  /** Zoom to fit image in canvas */
  zoomToFit: () => void;
  /** Zoom to actual size (1:1 pixels) */
  zoomToActual: () => void;
  /** Reset viewport with animation */
  resetViewport: () => void;
  /** Get current viewport state */
  getViewport: () => ViewportState;
  /** Set viewport state directly */
  setViewport: (viewport: Partial<ViewportState>) => void;
  /** Get underlying HDRCanvas instance (advanced) */
  getCanvas: () => import("../HDRCanvas").HDRCanvas | null;
}

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

export const HDRImage = forwardRef<HDRImageHandle, HDRImageProps>(
  function HDRImage(
    {
      image,
      options,
      onLoad,
      onError,
      zoomable = false,
      fitToImage = false,
      className,
      style,
      ...rest
    },
    ref
  ) {
    const [aspectRatio, setAspectRatio] = useState<number | undefined>();

    // Initialize HDRCanvas instance
    const { canvasRef, instanceRef } = useHDRCanvas(options, onError);

    // Expose imperative handle
    useImperativeHandle(
      ref,
      () => ({
        zoomIn: (factor?: number) => instanceRef.current?.zoomIn(factor),
        zoomOut: (factor?: number) => instanceRef.current?.zoomOut(factor),
        zoomToFit: () => instanceRef.current?.zoomToFit(),
        zoomToActual: () => instanceRef.current?.zoomToActual(),
        resetViewport: () => instanceRef.current?.resetViewportAnimated(),
        getViewport: () =>
          instanceRef.current?.getViewport() ?? { zoom: 1, panX: 0, panY: 0 },
        setViewport: (viewport) => instanceRef.current?.setViewport(viewport),
        getCanvas: () => instanceRef.current,
      }),
      [instanceRef]
    );

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

    useViewport(instanceRef, canvasRef, viewportOptions);

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
        {...rest}
      />
    );
  }
);

export { type UseViewportOptions, type UseViewportResult, type ImageInfo } from "./hooks";
