/**
 * Image Canvas Component
 *
 * Demonstrates usage of @dimkatet/hdr-canvas React component
 */

import type { ImageLoader, RenderState } from '@dimkatet/hdr-canvas';
import { HDRImage, type HDRImageHandle } from '@dimkatet/hdr-canvas/react';
import { useCallback, useRef, useState } from 'react';

interface ImageCanvasProps {
  loader?: ImageLoader;
  options?: Partial<RenderState>;
  onRenderStateSync?: (state: RenderState) => void;
}

export function ImageCanvas({ loader, options, onRenderStateSync }: ImageCanvasProps) {
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const hdrRef = useRef<HDRImageHandle>(null);

  const handleError = useCallback((err: Error) => {
    console.log(err);
    setError(err.message);
  }, []);

  const handleLoad = useCallback(() => {
    setError(null);
    const effectiveState = hdrRef.current?.getCanvas()?.render.getState();
    if (effectiveState) {
      onRenderStateSync?.(effectiveState);
    }
  }, [onRenderStateSync]);
  const handleZoom = useCallback((zoomLevel: number) => setZoom(zoomLevel), []);

  const handleExport = useCallback(async () => {
    if (!hdrRef.current) return;

    try {
      setExporting(true);
      const blob = await hdrRef.current.export({ type: 'image/png' });

      // Download the exported PNG
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hdr-export-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, []);

  // Button style
  const btnStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: '#333',
    color: '#fff',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    minWidth: '44px',
  };

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
  if (!loader) return null;
  return (
    <div>
      <HDRImage
        ref={hdrRef}
        objectFit="auto"
        loader={loader}
        options={{
          ...options,
          transparent: true,
          debug: true,
        }}
        onLoad={handleLoad}
        onError={handleError}
        onZoom={handleZoom}
        interactions={{
          wheel: { sensitivity: 0.0015 },
          drag: true,
          touch: true,
          minZoom: 0.5,
          maxZoom: 20,
          animationDuration: 100,
          keyboard: true, // Enable keyboard controls with default settings
        }}
        style={{
          display: 'block',
          // height: '70%',
          // width: 'auto'
          width: '70%',
          // width: 700
        }}
      />

      {/* Viewport Controls */}
      <div
        style={{
          marginTop: '12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.zoomOut()}>
          -
        </button>
        <span style={{ color: '#ccc', minWidth: '60px', textAlign: 'center' }}>
          {zoom.toFixed(2)}x
        </span>
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.zoomIn()}>
          +
        </button>
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.zoomToFit()}>
          Fit
        </button>
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.zoomToActual()}>
          1:1
        </button>
        <button type="button" style={btnStyle} onClick={() => hdrRef.current?.resetViewport()}>
          Reset
        </button>

        {/* Separator */}
        <div
          style={{
            width: '1px',
            height: '24px',
            backgroundColor: '#555',
            margin: '0 4px',
          }}
        />

        {/* Export button */}
        <button
          type="button"
          style={{
            ...btnStyle,
            backgroundColor: exporting ? '#666' : '#4a9eff',
            cursor: exporting ? 'not-allowed' : 'pointer',
            opacity: exporting ? 0.6 : 1,
            minWidth: '100px',
          }}
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? 'Exporting...' : 'Export PNG'}
        </button>
      </div>
    </div>
  );
}
