import { useEffect, useRef, useState } from 'react';
import { HDRCanvas } from '../../HDRCanvas';
import type { HDRCanvasOptions, IHDRCanvas } from '../../types';

export interface UseHDRCanvasResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  instance: IHDRCanvas | null;
}

/**
 * Hook for HDRCanvas instance lifecycle management.
 * Creates instance on mount, initializes async, destroys on unmount.
 * Enables auto-resize to sync canvas pixel size with CSS layout size.
 *
 * Returns `instance` as null until initialization completes.
 * Other hooks use `instance` in their dependency arrays —
 * when it transitions from null → object, effects re-run automatically.
 */
export function useHDRCanvas(
  initialOptions: HDRCanvasOptions,
  onError?: (error: Error) => void
): UseHDRCanvasResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [instance, setInstance] = useState<IHDRCanvas | null>(null);
  const optionsRef = useRef(initialOptions);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!canvasRef.current) return;

    let cleanup: (() => void) | undefined;
    let hdr: HDRCanvas | null = null;
    let cancelled = false;

    (async () => {
      try {
        hdr = new HDRCanvas(canvasRef.current!, optionsRef.current);
        await hdr.initialize();
        if (cancelled) {
          hdr.destroy();
          return;
        }
        cleanup = hdr.control.enableAutoResize();
        setInstance(hdr);
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current?.(error as Error);
        }
      }
    })();

    return () => {
      cancelled = true;
      setInstance(null);
      cleanup?.();
      hdr?.destroy();
    };
  }, []);

  return { canvasRef, instance };
}
