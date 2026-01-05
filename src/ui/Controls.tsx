/**
 * Controls Component
 *
 * UI controls for exposure, tone mapping, and visualization modes.
 */

import type { RenderState, ToneMappingOperator, VisualizationMode } from '../types';

interface ControlsProps {
  renderState: RenderState;
  onRenderStateChange: (state: RenderState) => void;
  hdrMode: boolean;
  onHdrModeChange: (enabled: boolean) => void;
  hdrAvailable: boolean;
}

export function Controls({ renderState, onRenderStateChange, hdrMode, onHdrModeChange, hdrAvailable }: ControlsProps) {
  const handleExposureChange = (ev: number) => {
    onRenderStateChange({ ...renderState, exposure: ev });
  };

  const handleToneMappingChange = (operator: ToneMappingOperator) => {
    onRenderStateChange({ ...renderState, toneMapping: operator });
  };

  const handleVisualizationModeChange = (mode: VisualizationMode) => {
    onRenderStateChange({ ...renderState, mode });
  };

  return (
    <div style={{ padding: '16px', backgroundColor: '#1a1a1a', color: '#fff' }}>
      {/* Exposure Control */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Exposure: {renderState.exposure.toFixed(2)} EV
        </label>
        <input
          type="range"
          min="-10"
          max="10"
          step="0.1"
          value={renderState.exposure}
          onChange={(e) => handleExposureChange(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888' }}>
          <span>-10 EV</span>
          <span>0 EV</span>
          <span>+10 EV</span>
        </div>
      </div>

      {/* Tone Mapping */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Tone Mapping
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['none', 'reinhard', 'aces'] as ToneMappingOperator[]).map((op) => (
            <button
              key={op}
              onClick={() => handleToneMappingChange(op)}
              style={{
                padding: '8px 16px',
                backgroundColor: renderState.toneMapping === op ? '#4a9eff' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              {op}
            </button>
          ))}
        </div>
      </div>

      {/* Visualization Mode */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Visualization
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['rgb', 'luminance', 'clipping'] as VisualizationMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => handleVisualizationModeChange(mode)}
              style={{
                padding: '8px 16px',
                backgroundColor: renderState.mode === mode ? '#4a9eff' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textTransform: 'capitalize',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* HDR Mode */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', cursor: hdrAvailable ? 'pointer' : 'not-allowed', opacity: hdrAvailable ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={hdrMode}
            onChange={(e) => onHdrModeChange(e.target.checked)}
            disabled={!hdrAvailable}
            style={{ marginRight: '8px', width: '18px', height: '18px', cursor: hdrAvailable ? 'pointer' : 'not-allowed' }}
          />
          <span style={{ fontWeight: 'bold' }}>HDR Mode (PQ Output)</span>
        </label>
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: hdrAvailable ? '#888' : '#fbbf24', lineHeight: '1.4' }}>
          {hdrAvailable ? (
            <>Enable PQ (ST.2084) encoding for native HDR displays. Your display supports HDR output.</>
          ) : (
            <>⚠️ HDR mode unavailable: Requires HDR monitor. On SDR display, this would produce very dark, incorrect output.</>
          )}
        </p>
      </div>
    </div>
  );
}
