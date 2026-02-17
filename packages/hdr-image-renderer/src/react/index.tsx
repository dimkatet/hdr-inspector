// React component wrapper
// Thin wrapper around HDRCanvas class with composable hooks

import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import type {
  ExportOptions,
  HDRCanvasOptions,
  ImageData,
  ImageLoader,
  KeyboardConfig,
  LoadingState,
  ObjectFit,
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
  /** Export rendered image as Blob (PNG/JPEG by default, custom encoder via callback) */
  export: (options?: ExportOptions) => Promise<Blob>;
  /** Get underlying HDRCanvas instance (advanced) */
  getCanvas: () => import('../types').IHDRCanvas | null;
}

export interface HDRImageProps
  extends Omit<
    React.CanvasHTMLAttributes<HTMLCanvasElement>,
    'onLoad' | 'onError' | 'onViewportChange'
  > {
  /** Image data to display (LinearImageData or EncodedImageData). Mutually exclusive with `loader`. */
  image?: ImageData;
  /** Async image loader function. Mutually exclusive with `image`. */
  loader?: ImageLoader;
  /** Placeholder image to show while loader is running */
  placeholder?: ImageData;
  /** Error fallback image to show if loader fails */
  errorFallback?: ImageData;
  /** Timeout in milliseconds for loader (rejects if exceeded) */
  loadingTimeout?: number;
  /** Callback when loading state changes (only when using loader) */
  onLoadingStateChange?: (state: LoadingState) => void;
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
  /**
   * Object-fit mode for image display.
   * - 'auto': Adjust canvas aspect-ratio to match image + use contain rendering (replaces fitToImage)
   * - 'contain': Fit entire image within canvas, letterbox/pillarbox as needed (default)
   * - 'cover': Fill canvas completely, crop excess edges
   * - 'fill': Stretch image to fill canvas
   * - 'none': Display at natural size (1:1 pixel mapping), centered
   * - 'scale-down': Like contain but never upscale small images
   */
  objectFit?: ObjectFit | 'auto';
}

export const HDRImage = forwardRef<HDRImageHandle, HDRImageProps>(function HDRImage(
  {
    image,
    loader,
    placeholder,
    errorFallback,
    loadingTimeout,
    onLoadingStateChange,
    options,
    onLoad,
    onError,
    interactions = false,
    onViewportChange,
    onZoom,
    objectFit,
    className,
    style,
    ...rest
  },
  ref
) {
  const [aspectRatio, setAspectRatio] = useState<number | undefined>();

  // Resolve objectFit: 'auto' → 'contain' for the library, other values pass through
  const resolvedObjectFit = objectFit === 'auto' ? ('contain' as const) : objectFit;

  // Merge resolved objectFit into initial options so HDRCanvas starts with the correct value
  // (avoids a first-frame flash where Settings defaults to 'contain' before useRenderOptions fires)
  const initialOptions = useMemo(
    () => (resolvedObjectFit ? { ...options, objectFit: resolvedObjectFit } : options),
    [options, resolvedObjectFit]
  );

  // Initialize HDRCanvas instance
  const { canvasRef, instance } = useHDRCanvas(initialOptions, onError);

  // Subscribe to zoom changes
  useZoomCallback(instance, onZoom);

  // Expose imperative handle
  useImperativeHandle(
    ref,
    () => ({
      zoomIn: (factor?: number) => instance?.viewport.zoomIn(factor),
      zoomOut: (factor?: number) => instance?.viewport.zoomOut(factor),
      zoomToFit: () => instance?.viewport.zoomToFit(),
      zoomToActual: () => instance?.viewport.zoomToActual(),
      resetViewport: () => instance?.viewport.reset(),
      getViewport: () => instance?.viewport.getState() ?? { zoom: 1, panX: 0, panY: 0 },
      setViewport: (viewport) => instance?.viewport.setViewport(viewport),
      export: async (options?: ExportOptions) => {
        if (!instance) {
          throw new Error('HDRCanvas instance not initialized');
        }
        return await instance.export.toBlob(options);
      },
      getCanvas: () => instance,
    }),
    [instance]
  );

  // Handle image load with aspect ratio extraction (for 'auto' objectFit)
  const handleLoad = useCallback(
    (info: ImageInfo) => {
      if (objectFit === 'auto') {
        setAspectRatio(info.aspectRatio);
      }
      onLoad?.(info);
    },
    [objectFit, onLoad]
  );

  // Load image (supports both direct ImageData and async loader)
  useImageLoader(instance, {
    image,
    loader,
    placeholder,
    errorFallback,
    timeout: loadingTimeout,
    onLoad: handleLoad,
    onError,
    onLoadingStateChange,
  });

  // Sync render options (with resolved objectFit)
  useRenderOptions(instance, options, resolvedObjectFit);

  // Setup zoom/pan if enabled
  const viewportOptions: UseViewportOptions =
    typeof interactions === 'boolean'
      ? { enabled: interactions, onViewportChange }
      : { enabled: true, ...interactions, onViewportChange };

  useViewport(instance, viewportOptions);

  // Build canvas style
  const canvasStyle: React.CSSProperties = {
    ...style,
    cursor: viewportOptions.enabled ? 'grab' : undefined,
    aspectRatio: objectFit === 'auto' ? aspectRatio : style?.aspectRatio,
    outline: 'none', // Remove focus outline for keyboard navigation
  };

  return <canvas ref={canvasRef} className={className} style={canvasStyle} {...rest} />;
});

// Re-export loading types for convenience
export type { ImageLoader, LoadingState, LoadOptions } from '../types';
export type {
  ImageInfo,
  UseImageLoaderOptions,
  UseImageLoaderResult,
  UseViewportOptions,
  UseViewportResult,
} from './hooks';
