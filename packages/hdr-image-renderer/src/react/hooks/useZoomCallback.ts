import { useEffect, useRef } from 'react';
import { throttle } from 'throttle-debounce';
import type { IHDRCanvas, ViewportState } from '../../types';

/**
 * Hook for subscribing to zoom changes on HDRCanvas.
 * Uses ref pattern to avoid re-subscribing when callback changes.
 */
export function useZoomCallback(
  instanceRef: React.RefObject<IHDRCanvas | null>,
  onZoom?: (zoom: number, state: ViewportState) => void
): void {
  const onZoomRef = useRef(onZoom);

  useEffect(() => {
    onZoomRef.current = onZoom;
  }, [onZoom]);

  useEffect(() => {
    if (!instanceRef.current || !onZoomRef.current) return;
    const throttledCallback = throttle(100, onZoomRef.current);
    const unsubscribe = instanceRef.current.on('viewport:mutation', ({ mutation, target }) => {
      const { type, source } = mutation;
      if (type === 'reset') {
        return throttledCallback(target.zoom, target);
      }
      if (type === 'zoom') {
        if (source === 'wheel') {
          return throttledCallback(target.zoom, target);
        }
        onZoomRef.current?.(target.zoom, target);
      }
    });

    return unsubscribe;
  }, [instanceRef]);
}
