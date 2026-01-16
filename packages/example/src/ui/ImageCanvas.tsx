/**
 * Image Canvas Component
 *
 * Demonstrates usage of @dimkatet/hdr-image-renderer React component
 */

import { useState, useRef, useCallback } from 'react'
import type { LinearImageData, RenderState, ViewportState } from '@dimkatet/hdr-image-renderer'
import { HDRImage, type HDRImageHandle } from '@dimkatet/hdr-image-renderer/react'

interface ImageCanvasProps {
  image: LinearImageData | null
  renderState: RenderState
}

export function ImageCanvas({ image, renderState }: ImageCanvasProps) {
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const hdrRef = useRef<HDRImageHandle>(null)

  const handleError = (err: Error) => {
    console.error('[ImageCanvas] Error:', err)
    setError(err.message)
  }

  const handleLoad = () => {
    console.log('[ImageCanvas] Image loaded successfully')
    setError(null)
  }

  // Update zoom display only when animation ends (avoids 60fps re-renders)
  const handleAnimationEnd = useCallback((viewport: ViewportState) => {
    console.log('[ImageCanvas] Animation ended. Zoom:', viewport.zoom)
    setZoom(viewport.zoom)
  }, [])

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
  }

  if (error) {
    return (
      <div
        style={{
          padding: '40px',
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '4px',
          textAlign: 'center'
        }}
      >
        <h3 style={{ color: '#ff6666', margin: '0 0 16px' }}>WebGPU Error</h3>
        <p style={{ color: '#999', margin: '0 0 16px' }}>{error}</p>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          WebGPU is required for this application. Please use Chrome/Edge 113+ or Safari 18+.
        </p>
      </div>
    )
  }

  return (
    <div>
      <HDRImage
        ref={hdrRef}
        fitToImage
        image={image ?? undefined}
        options={{
          ...renderState,
          transparent: true,
        }}
        onLoad={handleLoad}
        onError={handleError}
        interactions={{
          wheel: { sensitivity: 0.001 },
          drag: true,
          touch: true,
          minZoom: 0.5,
          maxZoom: 20,
          animationSpeed: 0.15,
          keyboard: true, // Enable keyboard controls with default settings
        }}
        onAnimationEnd={handleAnimationEnd}
        style={{
          display: "block",
          height: "60vh",
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
        <button style={btnStyle} onClick={() => hdrRef.current?.zoomOut()}>
          -
        </button>
        <span style={{ color: '#ccc', minWidth: '60px', textAlign: 'center' }}>
          {zoom.toFixed(2)}x
        </span>
        <button style={btnStyle} onClick={() => hdrRef.current?.zoomIn()}>
          +
        </button>
        <button style={btnStyle} onClick={() => hdrRef.current?.zoomToFit()}>
          Fit
        </button>
        <button style={btnStyle} onClick={() => hdrRef.current?.zoomToActual()}>
          1:1
        </button>
        <button style={btnStyle} onClick={() => hdrRef.current?.resetViewport()}>
          Reset
        </button>
      </div>
    </div>
  );
}
