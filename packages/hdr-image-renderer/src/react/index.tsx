// React component wrapper
// Thin wrapper around HDRCanvas class with composable hooks

import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import type {
  HDRCanvasOptions,
  ImageData,
  KeyboardConfig,
  ViewportConfig,
  ViewportState,
  WheelConfig,
} from '../types';
import {
  type ImageInfo,
  type UseViewportOptions,
  useHDRCanvas,
  useImageLoader,
  useRenderOptions,
  useViewport,
  useZoomCallback,
} from './hooks';

/**
 * Configuration for interactions - combines which interactions are enabled
 * and how the viewport behaves
 *
 * @example
 * // Enable all interactions with defaults
 * interactions={true}
 *
 * @example
 * // Enable specific interactions only
 * interactions={{ wheel: true, drag: false, touch: true }}
 *
 * @example
 * // Enable interactions with custom wheel sensitivity
 * interactions={{
 *   wheel: { sensitivity: 0.002 },
 *   drag: true,
 *   touch: true,
 *   minZoom: 0.5,
 *   maxZoom: 20,
 *   animationSpeed: 0.2,
 * }}
 *
 * @example
 * // Enable interactions with custom keyboard bindings
 * interactions={{
 *   wheel: true,
 *   drag: true,
 *   touch: true,
 *   keyboard: {
 *     enabled: true,
 *     panUp: ['w', 'ArrowUp'],
 *     zoomIn: ['+', '='],
 *     panStep: 0.15,
 *   }
 * }}
 */
export type InteractionsConfig = ViewportConfig & {
  /** Enable/configure mouse wheel zoom (true for defaults, object for custom config) */
  wheel?: boolean | WheelConfig;
  /** Enable mouse drag pan (default: true) */
  drag?: boolean;
  /** Enable touch gestures (default: true) */
  touch?: boolean;
  /** Keyboard control configuration (true for defaults, object for custom config) */
  keyboard?: boolean | KeyboardConfig;
};

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
  getCanvas: () => import('../HDRCanvas').HDRCanvas | null;
}

export interface HDRImageProps
  extends Omit<
    React.CanvasHTMLAttributes<HTMLCanvasElement>,
    'onLoad' | 'onError' | 'onViewportChange'
  > {
  /** Image data to display (LinearImageData or EncodedImageData) */
  image?: ImageData;
  /** Render options (exposure, toneMapping, etc.) */
  options: HDRCanvasOptions;
  /** Callback when image loads successfully with image info */
  onLoad?: (info: ImageInfo) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Enable/configure zoom/pan interactions (wheel, drag, touch, minZoom, maxZoom, etc.) */
  interactions?: boolean | InteractionsConfig;
  /** Callback when viewport changes (fires every frame during animation) */
  onViewportChange?: (viewport: ViewportState) => void;
  /** Callback when zoom changes (throttled for wheel/pinch, immediate for buttons) */
  onZoom?: (zoom: number, state: ViewportState) => void;
  /** Auto-adjust canvas aspect ratio to match loaded image */
  fitToImage?: boolean;
}

export const HDRImage = forwardRef<HDRImageHandle, HDRImageProps>(function HDRImage(
  {
    image,
    options,
    onLoad,
    onError,
    interactions = false,
    onViewportChange,
    onZoom,
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

  // Subscribe to zoom changes
  useZoomCallback(instanceRef, onZoom);

  // Expose imperative handle
  useImperativeHandle(
    ref,
    () => ({
      zoomIn: (factor?: number) => instanceRef.current?.viewport.zoomIn(factor),
      zoomOut: (factor?: number) => instanceRef.current?.viewport.zoomOut(factor),
      zoomToFit: () => instanceRef.current?.viewport.zoomToFit(),
      zoomToActual: () => instanceRef.current?.viewport.zoomToActual(),
      resetViewport: () => instanceRef.current?.viewport.reset(),
      getViewport: () => instanceRef.current?.viewport.getState() ?? { zoom: 1, panX: 0, panY: 0 },
      setViewport: (viewport) => instanceRef.current?.viewport.setViewport(viewport),
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
    typeof interactions === 'boolean'
      ? { enabled: interactions, onViewportChange }
      : { enabled: true, ...interactions, onViewportChange };

  useViewport(instanceRef, canvasRef, viewportOptions);

  // Build canvas style
  const canvasStyle: React.CSSProperties = {
    ...style,
    cursor: viewportOptions.enabled ? 'grab' : undefined,
    aspectRatio: fitToImage ? aspectRatio : style?.aspectRatio,
    outline: 'none', // Remove focus outline for keyboard navigation
  };

  return <canvas ref={canvasRef} className={className} style={canvasStyle} {...rest} />;
});

export type {
  ImageInfo,
  UseViewportOptions,
  UseViewportResult,
} from './hooks';
