/**
 * HDR Capabilities Info Panel
 *
 * Displays detected HDR capabilities of the browser and display.
 */

import { useState, useEffect } from 'react';
import { detectHDRCapabilities, getCapabilitiesDescription, type HDRCapabilities } from '../core/hdr-capabilities';

export function HDRInfo() {
  const [capabilities, setCapabilities] = useState<HDRCapabilities | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const detectCaps = async () => {
      const caps = await detectHDRCapabilities();
      setCapabilities(caps);
      console.log('[HDRInfo] Detected capabilities:', caps);
    };

    detectCaps();
  }, []);

  if (!capabilities) {
    return null;
  }

  const descriptions = getCapabilitiesDescription(capabilities);

  return (
    <div style={{
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
      minWidth: '200px'
    }}>
      <div
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <strong>HDR Capabilities {isExpanded ? '▼' : '▶'}</strong>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '8px', lineHeight: '1.6' }}>
          {descriptions.map((desc, i) => (
            <div key={i}>{desc}</div>
          ))}

          {capabilities.canvasHDR && (
            <div style={{ marginTop: '8px', color: '#4ade80' }}>
              🎉 Native HDR mode available!
            </div>
          )}

          {!capabilities.canvasHDR && capabilities.displayHDR && (
            <div style={{ marginTop: '8px', color: '#fbbf24' }}>
              ⚠️ Display supports HDR, but Canvas HDR not enabled.
              {' '}Try chrome://flags/#enable-hdr-canvas
            </div>
          )}

          {!capabilities.displayHDR && (
            <div style={{ marginTop: '8px', color: '#94a3b8' }}>
              💡 Using SDR tone mapping mode
            </div>
          )}
        </div>
      )}
    </div>
  );
}
