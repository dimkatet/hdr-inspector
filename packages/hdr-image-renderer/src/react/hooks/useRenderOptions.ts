import { useEffect } from "react";
import type { HDRCanvas } from "../../HDRCanvas";
import type { HDRCanvasOptions } from "../../types";

/**
 * Hook for synchronizing render options with HDRCanvas instance.
 * Updates exposure, toneMapping, hdrMode, visualizationMode, colorSpace.
 */
export function useRenderOptions(
  instanceRef: React.RefObject<HDRCanvas | null>,
  options: HDRCanvasOptions
): void {
  const { exposure, toneMapping, hdrMode, visualizationMode, colorSpace } =
    options;

  useEffect(() => {
    instanceRef.current?.setExposure(exposure ?? 0);
  }, [exposure, instanceRef]);

  useEffect(() => {
    instanceRef.current?.setToneMapping(toneMapping ?? "aces");
  }, [toneMapping, instanceRef]);

  useEffect(() => {
    instanceRef.current?.setHDRMode(hdrMode ?? false);
  }, [hdrMode, instanceRef]);

  useEffect(() => {
    if (visualizationMode) {
      instanceRef.current?.setVisualizationMode(visualizationMode);
    }
  }, [visualizationMode, instanceRef]);

  useEffect(() => {
    if (colorSpace) {
      instanceRef.current?.setColorSpace(colorSpace);
    }
  }, [colorSpace, instanceRef]);
}
