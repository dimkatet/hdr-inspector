/**
 * Gallery Component
 *
 * Displays multiple HDR images in a grid with async loading support
 */

import type { ImageLoader, LoadingState } from '@dimkatet/hdr-image-renderer';
import { HDRImage } from '@dimkatet/hdr-image-renderer/react';
import { useCallback, useRef, useState } from 'react';

interface GalleryImage {
  id: string;
  loader: ImageLoader;
  filename: string;
}

interface GalleryProps {
  images: GalleryImage[];
  onClose: () => void;
}

export function Gallery({ images, onClose }: GalleryProps) {
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadingStates, setLoadingStates] = useState<Record<string, LoadingState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const startTimeRef = useRef<number>(performance.now());

  const handleLoad = useCallback(
    (_id: string) => {
      setLoadedCount((prev) => {
        const newCount = prev + 1;
        if (newCount === images.length) {
          const elapsed = performance.now() - startTimeRef.current;
          console.log(`[Gallery] All ${images.length} images loaded in ${elapsed.toFixed(0)}ms`);
        }
        return newCount;
      });
    },
    [images.length]
  );

  const handleError = useCallback((id: string, err: Error) => {
    setErrors((prev) => ({ ...prev, [id]: err.message }));
  }, []);

  const handleLoadingStateChange = useCallback((id: string, state: LoadingState) => {
    setLoadingStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  const loadingCount = Object.values(loadingStates).filter((s) => s.status === 'loading').length;

  return (
    <div>
      {/* Header with stats */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          padding: '12px 16px',
          backgroundColor: '#1a1a1a',
          borderRadius: '8px',
        }}
      >
        <div>
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
            Gallery ({images.length} images)
          </span>
          <span style={{ marginLeft: '16px', color: '#888' }}>
            Loaded: {loadedCount}/{images.length}
          </span>
          {loadingCount > 0 && (
            <span style={{ marginLeft: '16px', color: '#66aaff' }}>Loading: {loadingCount}</span>
          )}
          {Object.keys(errors).length > 0 && (
            <span style={{ marginLeft: '16px', color: '#ff6666' }}>
              Errors: {Object.keys(errors).length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '8px 16px',
            backgroundColor: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Close Gallery
        </button>
      </div>

      {/* Image Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(600px, 1fr))',
          gap: '16px',
        }}
      >
        {images.map((item) => {
          const state = loadingStates[item.id];
          const isLoading = state?.status === 'loading';

          return (
            <div
              key={item.id}
              style={{
                backgroundColor: '#1a1a1a',
                borderRadius: '8px',
                overflow: 'hidden',
                border: errors[item.id] ? '1px solid #882222' : '1px solid #333',
              }}
            >
              {/* Image title */}
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#222',
                  fontSize: '12px',
                  color: '#aaa',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{item.filename}</span>
                {isLoading && (
                  <span style={{ color: '#66aaff', fontSize: '10px' }}>Loading...</span>
                )}
              </div>

              {/* HDR Image */}
              {errors[item.id] ? (
                <div
                  style={{
                    height: '400px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ff6666',
                    fontSize: '12px',
                    padding: '16px',
                  }}
                >
                  {errors[item.id]}
                </div>
              ) : (
                <HDRImage
                  objectFit="cover"
                  loader={item.loader}
                  options={{
                    exposure: 0,
                    toneMapping: 'none',
                    hdrMode: true,
                    colorSpace: 'display-p3',
                  }}
                  onLoad={() => handleLoad(item.id)}
                  onError={(err) => handleError(item.id, err)}
                  onLoadingStateChange={(state) => handleLoadingStateChange(item.id, state)}
                  style={{
                    display: 'block',
                    height: '400px',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { GalleryImage };
