/**
 * HDR Inspector - Example App
 *
 * Demonstrates usage of @dimkatet/hdr-image-renderer package
 */

import type { ImageData, RenderState } from '@dimkatet/hdr-image-renderer';
import { detectHDRCapabilities } from '@dimkatet/hdr-image-renderer';
import { useCallback, useEffect, useState } from 'react';
import { decodeRadianceHDR, DecodeError } from '../decoders';
import { syntheticImages } from '../utils/syntheticImages';
import { Controls } from './Controls';
import { FileDrop } from './FileDrop';
import { HDRInfo } from './HDRInfo';
import { ImageCanvas } from './ImageCanvas';

function App() {
  const [image, setImage] = useState<ImageData | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hdrAvailable, setHdrAvailable] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>({
    exposure: 0,
    toneMapping: 'reinhard',
    visualizationMode: 'rgb',
    hdrMode: false,
    colorSpace: 'srgb',
  });

  // Detect HDR capabilities on mount
  useEffect(() => {
    const checkHDR = async () => {
      const caps = await detectHDRCapabilities();
      setHdrAvailable(caps.canvasHDR);
      console.log('[App] HDR available:', caps.canvasHDR);
    };
    checkHDR();
  }, []);

  const handleFileLoaded = useCallback(async (file: File) => {
    try {
      setError(null);
      setFilename(file.name);

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Decode based on file extension
      let imageData: ImageData;

      if (file.name.toLowerCase().endsWith('.hdr') || file.name.toLowerCase().endsWith('.pic')) {
        // Radiance HDR
        imageData = decodeRadianceHDR(arrayBuffer);
      } else {
        throw new Error(`Unsupported format: ${file.name}`);
      }

      setImage(imageData);
    } catch (err) {
      if (err instanceof DecodeError) {
        setError(`Decode error: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load image');
      }
      console.error('Load error:', err);
      setImage(null);
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d0d', color: '#fff' }}>
      {/* HDR Capabilities Info */}
      <HDRInfo />

      {/* Header */}
      <header
        style={{
          padding: '16px 24px',
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #333',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>HDR Inspector</h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#888' }}>
          Scene-referred linear HDR image viewer (powered by @dimkatet/hdr-image-renderer)
        </p>
      </header>

      {/* Main Content */}
      <main style={{ padding: '24px', margin: '0 auto' }}>
        {!image ? (
          <>
            <FileDrop onFileLoaded={handleFileLoaded} />

            {/* Synthetic Test Patterns */}
            <div style={{
              marginTop: '24px',
              padding: '24px',
              backgroundColor: '#1a1a1a',
              borderRadius: '8px',
              border: '1px solid #333'
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 'bold' }}>
                Or try synthetic test patterns:
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {[
                  {
                    generator: syntheticImages.linearGradient,
                    label: 'Linear Gradient (HDR)',
                    description: 'Linear Gradient (Float32, HDR 0-10)',
                  },
                  {
                    generator: syntheticImages.rgbGradient,
                    label: 'RGB Gradient (Uint8)',
                    description: 'RGB Gradient (Uint8, sRGB)',
                  },
                  {
                    generator: syntheticImages.radialHDR,
                    label: 'Radial HDR',
                    description: 'Radial HDR (Float32, 0-50 range)',
                  },
                  {
                    generator: syntheticImages.checkerboard,
                    label: 'Checkerboard',
                    description: 'Checkerboard (Uint8, sRGB)',
                  },
                  {
                    generator: syntheticImages.spectrum16,
                    label: 'Spectrum (Uint16)',
                    description: 'Color Spectrum (Uint16, sRGB)',
                  },
                  {
                    generator: syntheticImages.pqGradient,
                    label: 'PQ Gradient (HDR10)',
                    description: 'PQ Gradient (Uint16, PQ 0-1000 nits)',
                  },
                  {
                    generator: syntheticImages.pqSunset,
                    label: 'PQ Sunset (HDR10)',
                    description: 'PQ Sunset (Uint16, PQ up to 4000 nits)',
                  },
                ].map((pattern) => (
                  <button
                    key={pattern.label}
                    type="button"
                    onClick={() => {
                      setImage(pattern.generator());
                      setFilename(pattern.description);
                    }}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#2a2a2a',
                      color: '#fff',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                  >
                    {pattern.label}
                  </button>
                ))}
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#666' }}>
                Test different ImageData formats: Float32 (linear HDR), Uint8 (sRGB), Uint16 (sRGB/PQ)
              </p>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
            {/* Image Viewer */}
            <div>
              {filename && (
                <div style={{ marginBottom: '16px' }}>
                  <h2 style={{ margin: '0 0 4px', fontSize: '18px' }}>{filename}</h2>
                  {/* <p style={{ margin: 0, fontSize: '14px', color: '#888' }}>
                    {image.width} × {image.height} px ({image.channels} channels)
                  </p> */}
                </div>
              )}
              <ImageCanvas image={image} renderState={renderState} />
              <button
                type="button"
                onClick={() => setImage(null)}
                style={{
                  marginTop: '16px',
                  padding: '8px 16px',
                  backgroundColor: '#333',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
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
              color: '#ff6666',
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
          marginTop: '40px',
        }}
      >
        <p style={{ margin: 0 }}>
          Linear, scene-referred HDR processing • BT.709 color space • No implicit transforms
        </p>
      </footer>
    </div>
  );
}

export default App;
