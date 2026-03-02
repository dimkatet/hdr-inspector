import { useEffect } from 'react';
import type { HDRCanvasOptions, IHDRCanvas, ObjectFit } from '../../types';

/**
 * Hook for synchronizing render options with HDRCanvas instance.
 *
 * Compares props against the current library state (instance.render.getState()) to
 * avoid spurious writes. This naturally handles the feedback loop: by the time
 * onRenderStateSync updates React state and triggers a re-render, the library state
 * is already up-to-date, so the comparison yields no changes and updateOptions is not called.
 *
 * @param objectFitOverride - Resolved objectFit value from the React component
 *   (e.g., 'auto' is resolved to 'contain' before reaching here)
 */
export function useRenderOptions(
  instance: IHDRCanvas | null,
  options: HDRCanvasOptions | undefined,
  objectFitOverride?: ObjectFit
): void {
  const { exposure, toneMapping, hdrMode, visualizationMode, colorSpace, objectFit } =
    options ?? {};
  const resolvedObjectFit = objectFitOverride ?? objectFit;

  useEffect(() => {
    if (!instance) return;

    const current = instance.render.getState();
    const updates: HDRCanvasOptions = {};

    if (exposure !== undefined && exposure !== current.exposure) updates.exposure = exposure;
    if (toneMapping !== undefined && toneMapping !== current.toneMapping)
      updates.toneMapping = toneMapping;
    if (hdrMode !== undefined && hdrMode !== current.hdrMode) updates.hdrMode = hdrMode;
    if (visualizationMode !== undefined && visualizationMode !== current.visualizationMode)
      updates.visualizationMode = visualizationMode;
    if (colorSpace !== undefined && colorSpace !== current.colorSpace)
      updates.colorSpace = colorSpace;
    if (resolvedObjectFit !== undefined && resolvedObjectFit !== current.objectFit)
      updates.objectFit = resolvedObjectFit;

    if (Object.keys(updates).length > 0) {
      instance.render.updateOptions(updates);
    }
  }, [exposure, toneMapping, hdrMode, visualizationMode, colorSpace, resolvedObjectFit, instance]);
}
