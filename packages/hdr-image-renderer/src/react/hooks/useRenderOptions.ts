import { useEffect } from 'react';
import type { HDRCanvasOptions, IHDRCanvas, ObjectFit } from '../../types';

/**
 * Hook for synchronizing render options with HDRCanvas instance.
 * Uses batch updateOptions() method for efficiency.
 *
 * @param objectFitOverride - Resolved objectFit value from the React component
 *   (e.g., 'auto' is resolved to 'contain' before reaching here)
 */
export function useRenderOptions(
  instance: IHDRCanvas | null,
  options: HDRCanvasOptions,
  objectFitOverride?: ObjectFit
): void {
  const { exposure, toneMapping, hdrMode, visualizationMode, colorSpace, objectFit } = options;
  const resolvedObjectFit = objectFitOverride ?? objectFit;

  useEffect(() => {
    instance?.render.updateOptions({
      exposure,
      toneMapping,
      hdrMode,
      visualizationMode,
      colorSpace,
      objectFit: resolvedObjectFit,
    });
  }, [
    exposure,
    toneMapping,
    hdrMode,
    visualizationMode,
    colorSpace,
    resolvedObjectFit,
    instance,
  ]);
}
