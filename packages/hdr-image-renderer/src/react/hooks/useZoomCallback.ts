import { useEffect, useRef } from 'react';
import type { HDRCanvas } from '../../HDRCanvas';
import type { ViewportState } from '../../types';

/**
 * Hook for subscribing to zoom changes on HDRCanvas.
 * Uses ref pattern to avoid re-subscribing when callback changes.
 */
export function useZoomCallback(
  instanceRef: React.RefObject<HDRCanvas | null>,
  onZoom?: (zoom: number, state: ViewportState) => void
): void {
  const onZoomRef = useRef(onZoom);

  useEffect(() => {
    onZoomRef.current = onZoom;
  }, [onZoom]);

  useEffect(() => {
    if (!instanceRef.current || !onZoomRef.current) return;

    const unsubscribe = instanceRef.current.onZoom((zoom, state) => {
      onZoomRef.current?.(zoom, state);
    });

    return unsubscribe;
  }, [instanceRef]);
}
