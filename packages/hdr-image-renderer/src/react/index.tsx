// React component wrapper
// Thin wrapper around HDRCanvas class with composable hooks

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import type {
  ExportDownloadOptions,
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
 * Actions passed to the `exportMenu` render prop
 */
export interface ExportActions {
  /** Export rendered image as Blob */
  toBlob: (options?: ExportOptions) => Promise<Blob>;
  /** Export and trigger browser download */
  download: (options?: ExportDownloadOptions) => Promise<void>;
}

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
  /** Export and trigger browser download */
  download: (options?: ExportDownloadOptions) => Promise<void>;
  /** Get underlying HDRCanvas instance (advanced) */
  getCanvas: () => import('../types').IHDRCanvas | null;
}

/**
 * Loader behavior config — only relevant when using the `loader` prop.
 */
export interface HDRImageLoadingConfig {
  /** Placeholder image to show while loader is running */
  placeholder?: ImageData;
  /** Error fallback image to show if loader fails */
  errorFallback?: ImageData;
  /** Timeout in milliseconds for loader (rejects if exceeded) */
  timeout?: number;
  /** Callback when loading state changes */
  onStateChange?: (state: LoadingState) => void;
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
  /** Loader behavior config: placeholder, fallback, timeout, state callback. */
  loading?: HDRImageLoadingConfig;
  /** Render options (exposure, toneMapping, hdrMode, etc.). All fields are optional — smart defaults applied. */
  options?: HDRCanvasOptions;
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
   * Callback when the canvas acquires or releases gesture ownership.
   * Useful for disabling parent scroll/carousel while the canvas owns the gesture.
   */
  onGestureChange?: (capturing: boolean, type: 'pan' | 'pinch' | null) => void;
  /**
   * Render custom export UI as an overlay on the canvas.
   * The function receives `ExportActions` with `toBlob` and `download` methods.
   * The overlay div has `pointerEvents: none` — add `pointerEvents: auto` on your component.
   *
   * @example
   * exportMenu={(actions) => (
   *   <MyDropdown style={{ pointerEvents: 'auto' }}>
   *     <button onClick={() => actions.download({ type: 'image/png' })}>PNG</button>
   *     <button onClick={() => actions.download({ type: 'image/jpeg', quality: 0.9 })}>JPEG</button>
   *   </MyDropdown>
   * )}
   */
  exportMenu?: (actions: ExportActions) => React.ReactNode;
  /**
   * Object-fit mode for image display.
   * - 'auto': Adjust canvas aspect-ratio to match image + use contain rendering (React-only)
   * - 'contain': Fit entire image within canvas, letterbox/pillarbox as needed (default)
   * - 'cover': Fill canvas completely, crop excess edges
   * - 'fill': Stretch image to fill canvas
   * - 'none': Display at natural size (1:1 pixel mapping), centered
   * - 'scale-down': Like contain but never upscale small images
   *
   * When set, takes priority over `options.objectFit`.
   * Use this prop (not `options.objectFit`) in React — it supports the extra 'auto' mode
   * and is synced on every render.
   */
  objectFit?: ObjectFit | 'auto';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const HDRImage = forwardRef<HDRImageHandle, HDRImageProps>(function HDRImage(
  {
    image,
    loader,
    loading,
    options,
    onLoad,
    onError,
    interactions = false,
    onViewportChange,
    onGestureChange,
    onZoom,
    objectFit,
    exportMenu,
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
    () => (resolvedObjectFit ? { ...options, objectFit: resolvedObjectFit } : (options ?? {})),
    [options, resolvedObjectFit]
  );

  // Initialize HDRCanvas instance
  const { canvasRef, instance } = useHDRCanvas(initialOptions, onError);

  // Subscribe to zoom changes
  useZoomCallback(instance, onZoom);

  // Stable export actions — passed to exportMenu render prop and used by the ref handle
  const exportActions = useMemo<ExportActions>(
    () => ({
      toBlob: (opts) => {
        if (!instance) throw new Error('HDRCanvas not initialized');
        return instance.export.toBlob(opts);
      },
      download: async (opts) => {
        if (!instance) throw new Error('HDRCanvas not initialized');
        const blob = await instance.export.toBlob(opts);
        const ext =
          opts?.extension ?? (opts?.encoder ? 'bin' : opts?.type === 'image/jpeg' ? 'jpg' : 'png');
        triggerDownload(blob, `${opts?.filename ?? `hdr-export-${Date.now()}`}.${ext}`);
      },
    }),
    [instance]
  );

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
      export: (opts) => exportActions.toBlob(opts),
      download: (opts) => exportActions.download(opts),
      getCanvas: () => instance,
    }),
    [instance, exportActions]
  );

  // Handle image load with aspect ratio extraction (for 'auto' objectFit)
  const handleLoad = useCallback(
    (info: ImageInfo) => {
      if (objectFit === 'auto') setAspectRatio(info.aspectRatio);
      onLoad?.(info);
    },
    [objectFit, onLoad]
  );

  // When objectFit='auto', sync canvas pixel size after CSS aspect-ratio is committed,
  // then force a render — ensures the image fits correctly on the first paint after load.
  // biome-ignore lint/correctness/useExhaustiveDependencies: aspectRatio changes only on image load, instance is stable after initialization
  useLayoutEffect(() => {
    if (!aspectRatio || !instance || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const pixelWidth = Math.round(rect.width * dpr);
    const pixelHeight = Math.round(rect.height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    instance.control.forceRender();
  }, [aspectRatio, instance]);

  // Load image (supports both direct ImageData and async loader)
  useImageLoader(instance, {
    image,
    loader,
    placeholder: loading?.placeholder,
    errorFallback: loading?.errorFallback,
    timeout: loading?.timeout,
    onLoad: handleLoad,
    onError,
    onLoadingStateChange: loading?.onStateChange,
  });

  // Sync render options (with resolved objectFit)
  useRenderOptions(instance, options, resolvedObjectFit);

  // Setup zoom/pan if enabled
  const viewportOptions: UseViewportOptions =
    typeof interactions === 'boolean'
      ? { enabled: interactions, onViewportChange, onGestureChange }
      : { enabled: true, ...interactions, onViewportChange, onGestureChange };

  useViewport(instance, viewportOptions);

  // Build canvas style
  const canvasStyle: React.CSSProperties = {
    aspectRatio: objectFit === 'auto' ? aspectRatio : style?.aspectRatio,
    outline: 'none', // Remove focus outline for keyboard navigation
    ...style,
  };

  if (exportMenu) {
    return (
      <div className={className} style={{ position: 'relative', ...canvasStyle }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%', outline: 'none' }}
          {...rest}
        />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {exportMenu(exportActions)}
        </div>
      </div>
    );
  }

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
