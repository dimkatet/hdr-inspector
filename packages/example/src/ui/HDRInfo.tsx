/**
 * HDR Capabilities Info Panel
 *
 * Displays detected HDR capabilities of the browser and display.
 */

import {
  detectHDRCapabilities,
  getCapabilitiesDescription,
  type HDRCapabilities,
} from '@dimkatet/hdr-image-renderer';
import { useEffect, useState } from 'react';

export function HDRInfo() {
  const [capabilities, setCapabilities] = useState<HDRCapabilities | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const detectCaps = async () => {
      const caps = await detectHDRCapabilities();
      setCapabilities(caps);
    };

    detectCaps();
  }, []);

  if (!capabilities) {
    return null;
  }

  const descriptions = getCapabilitiesDescription(capabilities);

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 1000,
        minWidth: '200px',
      }}
    >
      <button
        type="button"
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          background: 'none',
          border: 'none',
          color: 'inherit',
          font: 'inherit',
          padding: 0,
          textAlign: 'left',
          width: '100%',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <strong>HDR Capabilities {isExpanded ? '▼' : '▶'}</strong>
      </button>

      {isExpanded && (
        <div style={{ marginTop: '8px', lineHeight: '1.6' }}>
          {descriptions.map((desc) => (
            <div key={desc}>{desc}</div>
          ))}

          {capabilities.canvasHDR && (
            <div style={{ marginTop: '8px', color: '#4ade80' }}>🎉 Native HDR mode available!</div>
          )}

          {!capabilities.canvasHDR && capabilities.displayHDR && (
            <div style={{ marginTop: '8px', color: '#fbbf24' }}>
              ⚠️ Display supports HDR, but Canvas HDR not enabled. Try
              chrome://flags/#enable-hdr-canvas
            </div>
          )}

          {!capabilities.displayHDR && (
            <div style={{ marginTop: '8px', color: '#94a3b8' }}>💡 Using SDR tone mapping mode</div>
          )}
        </div>
      )}
    </div>
  );
}
