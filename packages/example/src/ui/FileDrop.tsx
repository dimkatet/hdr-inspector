/**
 * File Drop Component
 *
 * Drag-and-drop file uploader for HDR images.
 */

import { useCallback, useState } from 'react';

interface FileDropProps {
  onFileLoaded: (file: File) => void;
}

export function FileDrop({ onFileLoaded }: FileDropProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File) => onFileLoaded(file), [onFileLoaded]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: because this is a simple demo component, not a production-ready one
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        border: `2px dashed ${isDragging ? '#4a9eff' : '#555'}`,
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        backgroundColor: isDragging ? '#222' : '#1a1a1a',
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 'bold' }}>
        Drop image file here
      </p>
      <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#888' }}>
        Supported formats: AVIF, JPEG XL, JPEG Ultra HDR, PNG, Radiance HDR (.hdr, .pic)
      </p>
      <label
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          backgroundColor: '#4a9eff',
          color: '#fff',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        Choose File
        <input
          type="file"
          accept=".avif,.jxl,.jpg,.jpeg,.png,.hdr,.pic,.exr"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
}
