/**
 * HDR Inspector - Example App
 *
 * Demonstrates usage of @dimkatet/hdr-canvas package
 */

import { useState, useEffect } from 'react'
import type { LinearImageData, RenderState } from '@dimkatet/hdr-canvas'
import { decodeRadianceHDR, detectHDRCapabilities } from '@dimkatet/hdr-canvas'
import { FileDrop } from './FileDrop'
import { ImageCanvas } from './ImageCanvas'
import { Controls } from './Controls'
import { HDRInfo } from './HDRInfo'

function App() {
  const [image, setImage] = useState<LinearImageData | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hdrAvailable, setHdrAvailable] = useState(false)
  const [renderState, setRenderState] = useState<RenderState>({
    exposure: 0,
    toneMapping: 'reinhard',
    visualizationMode: 'rgb',
    hdrMode: false,
    colorSpace: 'srgb'
  })

  // Detect HDR capabilities on mount
  useEffect(() => {
    const checkHDR = async () => {
      const caps = await detectHDRCapabilities()
      setHdrAvailable(caps.canvasHDR)
      console.log('[App] HDR available:', caps.canvasHDR)
    }
    checkHDR()
  }, [])

  const handleFileLoaded = async (arrayBuffer: ArrayBuffer, name: string) => {
    try {
      setError(null)
      const decodedImage = decodeRadianceHDR(arrayBuffer)
      setImage(decodedImage)
      setFilename(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load image')
      console.error('Decode error:', err)
    }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d0d', color: '#fff' }}>
      {/* HDR Capabilities Info */}
      <HDRInfo />

      {/* Header */}
      <header
        style={{
          padding: '16px 24px',
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #333'
        }}
      >
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>HDR Inspector</h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#888' }}>
          Scene-referred linear HDR image viewer (powered by @dimkatet/hdr-canvas)
        </p>
      </header>

      {/* Main Content */}
      <main style={{ padding: '24px', margin: '0 auto' }}>
        {!image ? (
          <FileDrop onFileLoaded={handleFileLoaded} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
            {/* Image Viewer */}
            <div>
              {filename && (
                <div style={{ marginBottom: '16px' }}>
                  <h2 style={{ margin: '0 0 4px', fontSize: '18px' }}>{filename}</h2>
                  <p style={{ margin: 0, fontSize: '14px', color: '#888' }}>
                    {image.width} × {image.height} px ({image.channels} channels)
                  </p>
                </div>
              )}
              <ImageCanvas image={image} renderState={renderState} />
              <button
                onClick={() => setImage(null)}
                style={{
                  marginTop: '16px',
                  padding: '8px 16px',
                  backgroundColor: '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Load Different Image
              </button>
            </div>

            {/* Controls */}
            <div>
              <Controls
                renderState={renderState}
                onRenderStateChange={setRenderState}
                hdrAvailable={hdrAvailable}
              />
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div
            style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: '#331111',
              border: '1px solid #882222',
              borderRadius: '4px',
              color: '#ff6666'
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: '16px 24px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#666',
          borderTop: '1px solid #333',
          marginTop: '40px'
        }}
      >
        <p style={{ margin: 0 }}>
          Linear, scene-referred HDR processing • BT.709 color space • No implicit transforms
        </p>
      </footer>
    </div>
  )
}

export default App
