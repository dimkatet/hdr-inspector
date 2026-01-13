/**
 * File Drop Component
 *
 * Drag-and-drop file uploader for HDR images.
 */

import { useCallback, useState } from 'react';

interface FileDropProps {
  onFileLoaded: (arrayBuffer: ArrayBuffer, filename: string) => void;
}

export function FileDrop({ onFileLoaded }: FileDropProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (arrayBuffer) {
          onFileLoaded(arrayBuffer, file.name);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [onFileLoaded]
  );

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
        Drop HDR file here
      </p>
      <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#888' }}>
        Supported formats: Radiance HDR (.hdr), OpenEXR (.exr)
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
          accept=".hdr,.exr,.pic"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
      </label>
    </div>
  );
}
