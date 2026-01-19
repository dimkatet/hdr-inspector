import { useEffect, useRef } from 'react';
import { HDRCanvas } from '../../HDRCanvas';
import type { HDRCanvasOptions } from '../../types';

export interface UseHDRCanvasResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  instanceRef: React.RefObject<HDRCanvas | null>;
}

/**
 * Hook for HDRCanvas instance lifecycle management.
 * Creates instance on mount, destroys on unmount.
 * Enables auto-resize to sync canvas pixel size with CSS layout size.
 */
export function useHDRCanvas(
  initialOptions: HDRCanvasOptions,
  onError?: (error: Error) => void
): UseHDRCanvasResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<HDRCanvas | null>(null);

  // Initialize HDRCanvas instance with auto-resize
  useEffect(() => {
    if (!canvasRef.current) return;

    let cleanup: (() => void) | undefined;

    try {
      instanceRef.current = new HDRCanvas(canvasRef.current, initialOptions);
      cleanup = instanceRef.current.enableAutoResize();
    } catch (error) {
      onError?.(error as Error);
    }

    return () => {
      cleanup?.();
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount - initialOptions captured in closure

  return { canvasRef, instanceRef };
}
