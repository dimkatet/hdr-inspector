import { useEffect } from "react";
import type { HDRCanvas } from "../../HDRCanvas";
import type { HDRCanvasOptions } from "../../types";

/**
 * Hook for synchronizing render options with HDRCanvas instance.
 * Uses batch updateOptions() method for efficiency.
 */
export function useRenderOptions(
  instanceRef: React.RefObject<HDRCanvas | null>,
  options: HDRCanvasOptions
): void {
  const { exposure, toneMapping, hdrMode, visualizationMode, colorSpace } = options;

  useEffect(() => {
    instanceRef.current?.updateOptions({
      exposure,
      toneMapping,
      hdrMode,
      visualizationMode,
      colorSpace,
    });
  }, [exposure, toneMapping, hdrMode, visualizationMode, colorSpace, instanceRef]);
}
