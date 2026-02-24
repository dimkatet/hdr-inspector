/**
 * HDR Inspector - Example App
 *
 * Demonstrates usage of @dimkatet/hdr-canvas package
 */

import type { ImageData, RenderState } from '@dimkatet/hdr-canvas';
import { detectHDRCapabilities } from '@dimkatet/hdr-canvas';
import { createWorkerPool, decodeInWorker, detectFormat, type AutoWorkerClient, CodecLoadError } from '@dimkatet/jcodecs-auto';
// import { decodeAuto, detectFormat, DecodeError } from '../decoders';
import { useCallback, useEffect, useState, useRef } from 'react';
import { syntheticImages } from '../utils/syntheticImages';
import { Controls } from './Controls';
import { FileDrop } from './FileDrop';
import { Gallery, type GalleryImage } from './Gallery';
import { HDRInfo } from './HDRInfo';
import { ImageCanvas } from './ImageCanvas';

function App() {
  const [decodeClient, setDecodeClient] = useState<AutoWorkerClient | null>(null)
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
    objectFit: 'contain',
  });

  // Gallery state
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [isGalleryMode, setIsGalleryMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log('[App] Initializing decode worker pool...');
    createWorkerPool({ poolSize: 16, preferMT: true, type: 'decoder' }).then(client => {
      setDecodeClient(client);
    }).catch(err => {
      console.error('Failed to initialize decode worker pool:', err);
      setError('Failed to initialize decode workers');
    });
  }, [])

  // Detect HDR capabilities on mount
  useEffect(() => {
    const checkHDR = async () => {
      const caps = await detectHDRCapabilities();
      setHdrAvailable(caps.canvasHDR);
      console.log('[App] HDR available:', caps.canvasHDR);
    };
    checkHDR();
  }, []);

  // Handle multiple files for gallery (creates loaders, decoding happens in Gallery)
  const handleMultipleFiles = useCallback(
    (files: FileList) => {
      setError(null);
      if (!decodeClient) {
        setError('Decode client is not initialized')
        return;
      }
      const fileArray = Array.from(files);
      console.log(`[Gallery] Creating loaders for ${fileArray.length} files...`);
      // Create loader functions for each file (decoding is deferred to Gallery)
      // @ts-ignore
      const galleryItems: GalleryImage[] = fileArray.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        filename: file.name,
        loader: async () => {
          const arrayBuffer = await file.arrayBuffer();
          const { data, descriptor } = await decodeInWorker(decodeClient, arrayBuffer);
          
          return {
            data,
            width: descriptor.geometry.width,
            height: descriptor.geometry.height,
            channels: descriptor.channels.count,
            transferFunction: descriptor.transfer?.function,
            bitDepth: descriptor.numeric.bitDepth,
          }
        },
      }));

      setGalleryImages(galleryItems);
      setIsGalleryMode(true);
    },
    [decodeClient]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleMultipleFiles(files);
      }
      // Reset input so same files can be selected again
      e.target.value = '';
    },
    [handleMultipleFiles]
  );

  const handleFileLoaded = useCallback(async (file: File) => {
    try {
      setError(null);
      setFilename(file.name);

      if (!decodeClient) {
        setError('Decode client is not initialized')
        return;
      }

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Detect format
      const format = detectFormat(arrayBuffer);
      console.log('[App] Detected format:', format);

      if (format === 'unknown') {
        throw new Error(`Unsupported format: ${file.name}`);
      }

      // Use auto-decoder for AVIF, JXL, Gainmap, PNG
      console.log('[App] Using auto-decoder for:', format);
      const { data, descriptor } = await decodeInWorker(decodeClient, arrayBuffer);
      
      const imageData = {
        data,
        width: descriptor.geometry.width,
        height: descriptor.geometry.height,
        channels: descriptor.channels.count,
        transferFunction: descriptor.transfer?.function,
        bitDepth: descriptor.numeric.bitDepth,
      }
      console.log('[App] Decoded:', imageData);
      // @ts-ignore
      setImage(imageData);
    } catch (err) {
      if (err instanceof CodecLoadError) {
        setError(`Decode error: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load image');
      }
      console.error('Load error:', err);
      setImage(null);
    }
  }, [decodeClient]);

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
          Multi-format HDR image viewer • Powered by @dimkatet/hdr-canvas +
          @dimkatet/hdr-decoders
        </p>
      </header>

      {/* Hidden file input for multiple files */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".hdr,.pic,.avif,.jxl,.png,.jpg,.jpeg,.exr"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Main Content */}
      <main style={{ padding: '24px', margin: '0 auto' }}>
        {isGalleryMode ? (
          /* Gallery Mode */
          <Gallery
            images={galleryImages}
            onClose={() => {
              setIsGalleryMode(false);
              setGalleryImages([]);
            }}
          />
        ) : !image ? (
          <>
            <FileDrop onFileLoaded={handleFileLoaded} />

            {/* Load Multiple Button */}
            <div
              style={{
                marginTop: '24px',
                padding: '24px',
                backgroundColor: '#1a1a1a',
                borderRadius: '8px',
                border: '1px solid #333',
              }}
            >
              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 'bold' }}>
                Performance Test:
              </h3>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                Load Multiple Images
              </button>
              <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#666' }}>
                Select multiple HDR images to display in a gallery grid (for WebGPU performance
                testing)
              </p>
            </div>

            {/* Synthetic Test Patterns */}
            <div
              style={{
                marginTop: '24px',
                padding: '24px',
                backgroundColor: '#1a1a1a',
                borderRadius: '8px',
                border: '1px solid #333',
              }}
            >
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
                Test different ImageData formats: Float32 (linear HDR), Uint8 (sRGB), Uint16
                (sRGB/PQ)
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
