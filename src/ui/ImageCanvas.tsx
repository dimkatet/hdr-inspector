/**
 * Image Canvas Component
 *
 * WebGPU canvas for rendering HDR images with native HDR support.
 */

import { useEffect, useRef, useState } from 'react';
import type { LinearImage, RenderState } from '../types';
import { WebGPURenderer } from '../renderer/WebGPURenderer';

interface ImageCanvasProps {
  image: LinearImage | null;
  renderState: RenderState;
  hdrMode?: boolean; // Enable PQ encoding for HDR displays
}

export function ImageCanvas({ image, renderState, hdrMode = false }: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGPURenderer | null>(null);
  const previousImageRef = useRef<LinearImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize renderer once
  useEffect(() => {
    if (!canvasRef.current) return;

    console.log('[ImageCanvas] Initializing WebGPU renderer');

    const initRenderer = async () => {
      try {
        const renderer = new WebGPURenderer(canvasRef.current!);
        await renderer.initialize();
        rendererRef.current = renderer;
        previousImageRef.current = null;
        setIsInitialized(true);
        setError(null);
        console.log('[ImageCanvas] WebGPU renderer initialized');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize WebGPU';
        console.error('[ImageCanvas] Initialization error:', err);
        setError(message);
      }
    };

    initRenderer();

    return () => {
      console.log('[ImageCanvas] Destroying renderer');
      rendererRef.current?.destroy();
      rendererRef.current = null;
      previousImageRef.current = null;
      setIsInitialized(false);
    };
  }, []);

  // Upload image and render
  useEffect(() => {
    if (!image || !rendererRef.current || !isInitialized) return;

    // Only upload if image changed
    if (previousImageRef.current !== image) {
      console.log('[ImageCanvas] Uploading image:', image.width, 'x', image.height);
      rendererRef.current.uploadImage(image);
      previousImageRef.current = image;
    }

    // Always render (for renderState changes)
    rendererRef.current.render({
      exposure: renderState.exposure,
      toneMapping: renderState.toneMapping,
      visualizationMode: renderState.mode,
      hdrMode,
    });
  }, [image, renderState, hdrMode, isInitialized]);

  if (error) {
    return (
      <div
        style={{
          padding: '40px',
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '4px',
          textAlign: 'center',
        }}
      >
        <h3 style={{ color: '#ff6666', margin: '0 0 16px' }}>WebGPU Error</h3>
        <p style={{ color: '#999', margin: '0 0 16px' }}>{error}</p>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          WebGPU is required for this application. Please use Chrome/Edge 113+ or Safari 18+.
        </p>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={image?.width ?? 800}
      height={image?.height ?? 600}
      style={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: '80vh',
        objectFit: 'contain',
        backgroundColor: '#000',
        border: '1px solid #333',
      }}
    />
  );
}
