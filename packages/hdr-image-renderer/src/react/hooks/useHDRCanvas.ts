import { useEffect, useRef } from 'react';
import { HDRCanvas } from '../../HDRCanvas';
import type { HDRCanvasOptions, IHDRCanvas } from '../../types';

export interface UseHDRCanvasResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  instanceRef: React.RefObject<IHDRCanvas | null>;
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
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Initialize HDRCanvas instance with auto-resize
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO - need to verify if initialOptions should trigger re-initialization or just be captured in closure
  useEffect(() => {
    if (!canvasRef.current) return;

    let cleanup: (() => void) | undefined;

    try {
      const canvas = new HDRCanvas(canvasRef.current, initialOptions);
      canvas.initialize().then(() => {
        instanceRef.current = canvas;
        cleanup = canvas.control.enableAutoResize();
      });
    } catch (error) {
      onErrorRef.current?.(error as Error);
    }

    return () => {
      cleanup?.();
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []); // Only on mount - initialOptions captured in closure

  return { canvasRef, instanceRef };
}
