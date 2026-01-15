import { useEffect, useRef } from "react";
import { HDRCanvas } from "../../HDRCanvas";
import type { HDRCanvasOptions } from "../../types";

export interface UseHDRCanvasResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  instanceRef: React.RefObject<HDRCanvas | null>;
}

/**
 * Hook for HDRCanvas instance lifecycle management.
 * Creates instance on mount, destroys on unmount.
 * Syncs canvas pixel size with CSS layout size via ResizeObserver.
 */
export function useHDRCanvas(
  initialOptions: HDRCanvasOptions,
  onError?: (error: Error) => void
): UseHDRCanvasResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<HDRCanvas | null>(null);

  // Initialize HDRCanvas instance
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      instanceRef.current = new HDRCanvas(canvasRef.current, initialOptions);
    } catch (error) {
      onError?.(error as Error);
    }

    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, []); // Only on mount - initialOptions captured in closure

  // Sync canvas pixel size with CSS size
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
          // Re-render with new canvas size
          instanceRef.current?.forceRender();
        }
      }
    });

    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return { canvasRef, instanceRef };
}
