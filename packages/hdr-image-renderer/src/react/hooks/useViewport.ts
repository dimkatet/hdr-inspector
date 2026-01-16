import { useCallback, useEffect, useState } from "react";
import type { HDRCanvas } from "../../HDRCanvas";
import type { ViewportState, ViewportConfig, InteractionConfig } from "../../types";

export interface UseViewportOptions extends ViewportConfig, InteractionConfig {
  /** Enable zoom/pan interactions */
  enabled?: boolean;
  /** Callback when viewport changes (fires on every frame during animation) */
  onViewportChange?: (viewport: ViewportState) => void;
  /** Callback when animation completes (fires once per animation) */
  onAnimationEnd?: (viewport: ViewportState) => void;
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
  const { enabled = false, onViewportChange, onAnimationEnd, ...viewportConfig } = options;

  const [viewport, setViewport] = useState<ViewportState>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });

  // Attach interactions when enabled
  useEffect(() => {
    if (!enabled || !instanceRef.current) return;

    return instanceRef.current.attachInteractions({
      ...viewportConfig,
      onViewportChange: (v) => {
        setViewport(v);
        onViewportChange?.(v);
      },
      onAnimationEnd,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, instanceRef, viewportConfig.minZoom, viewportConfig.maxZoom, viewportConfig.wheelSensitivity, viewportConfig.animationSpeed]);

  // Update callbacks when they change (without re-attaching interactions)
  useEffect(() => {
    const canvas = instanceRef.current;
    if (!canvas) return;

    // Update callbacks on viewport controller via HDRCanvas method
    canvas.setViewportCallbacks(onViewportChange, onAnimationEnd);
  }, [instanceRef, onViewportChange, onAnimationEnd]);

  // Reset function
  const resetViewport = useCallback(() => {
    instanceRef.current?.resetViewport();
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }, [instanceRef]);

  return { viewport, resetViewport };
}
