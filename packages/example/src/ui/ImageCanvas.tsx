/**
 * Image Canvas Component
 *
 * Demonstrates usage of @dimkatet/hdr-image-renderer React component
 */

import { useState } from 'react'
import type { LinearImageData, RenderState } from '@dimkatet/hdr-image-renderer'
import { HDRImage } from '@dimkatet/hdr-image-renderer/react'

interface ImageCanvasProps {
  image: LinearImageData | null
  renderState: RenderState
}

export function ImageCanvas({ image, renderState }: ImageCanvasProps) {
  const [error, setError] = useState<string | null>(null)

  const handleError = (err: Error) => {
    console.error('[ImageCanvas] Error:', err)
    setError(err.message)
  }

  const handleLoad = () => {
    console.log('[ImageCanvas] Image loaded successfully')
    setError(null)
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
    <HDRImage
      image={image ?? undefined}
      exposure={renderState.exposure}
      toneMapping={renderState.toneMapping}
      visualizationMode={renderState.visualizationMode}
      hdrMode={renderState.hdrMode}
      colorSpace={renderState.colorSpace}
      onLoad={handleLoad}
      onError={handleError}
      style={{
        display: 'block',
        maxWidth: '100%',
        maxHeight: '80vh',
        objectFit: 'contain',
        backgroundColor: '#000',
        border: '1px solid #333'
      }}
    />
  )
}
