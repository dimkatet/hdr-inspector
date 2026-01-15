import { useCallback, useEffect, useState } from "react";
import type { HDRCanvas } from "../../HDRCanvas";
import type { ViewportState, ViewportConfig } from "../../types";

export interface UseViewportOptions extends ViewportConfig {
  /** Enable zoom/pan interactions */
  enabled?: boolean;
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
  const { enabled = false, ...viewportConfig } = options;

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
      onViewportChange: setViewport,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, instanceRef, viewportConfig.minZoom, viewportConfig.maxZoom, viewportConfig.wheelSensitivity, viewportConfig.animationSpeed]);

  // Reset function
  const resetViewport = useCallback(() => {
    instanceRef.current?.resetViewport();
    setViewport({ zoom: 1, panX: 0, panY: 0 });
  }, [instanceRef]);

  return { viewport, resetViewport };
}
