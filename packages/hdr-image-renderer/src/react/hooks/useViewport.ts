import { useCallback, useEffect, useRef, useState } from 'react';
import type { HDRCanvas } from '../../HDRCanvas';
import type { KeyboardConfig, ViewportConfig, ViewportState, WheelConfig } from '../../types';

export interface UseViewportOptions extends ViewportConfig {
  /** Enable zoom/pan interactions */
  enabled?: boolean;
  /** Enable/configure mouse wheel zoom (true for defaults, object for custom config) */
  wheel?: boolean | WheelConfig;
  /** Enable mouse drag pan (default: true) */
  drag?: boolean;
  /** Enable touch gestures (default: true) */
  touch?: boolean;
  /** Keyboard control configuration (true for defaults, object for custom config) */
  keyboard?: boolean | KeyboardConfig;
  /** Callback when viewport changes (fires on every frame during animation) */
  onViewportChange?: (viewport: ViewportState) => void;
}

export interface UseViewportResult {
  /** Current viewport state */
  viewport: ViewportState;
  /** Reset viewport to default */
  resetViewport: () => void;
}

/**
 * Hook for zoom/pan interactions on HDRCanvas.
 * Thin wrapper around HDRCanvas.attachInteractions().
 */
export function useViewport(
  instanceRef: React.RefObject<HDRCanvas | null>,
  _canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options: UseViewportOptions = {}
): UseViewportResult {
  const { enabled = false, onViewportChange, keyboard, ...viewportConfig } = options;

  const [viewport, setViewport] = useState<ViewportState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });

  // Store callback in ref to avoid re-subscribing
  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  // Attach interactions when enabled
  useEffect(() => {
    if (!enabled || !instanceRef.current) {
      return;
    }

    const detachInteractions = instanceRef.current.attachInteractions({
      ...viewportConfig,
      keyboard,
    });

    const unsubscribeViewport = instanceRef.current.onViewportChange((v) => {
      setViewport(v);
      onViewportChangeRef.current?.(v);
    });

    return () => {
      detachInteractions();
      unsubscribeViewport();
    };
  }, [
    enabled,
    instanceRef,
    viewportConfig.minZoom,
    viewportConfig.maxZoom,
    viewportConfig.animationDuration,
    viewportConfig.easing,
    keyboard,
  ]);

  // Reset function
  const resetViewport = useCallback(() => {
    instanceRef.current?.resetViewport();
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }, [instanceRef]);

  return { viewport, resetViewport };
}
