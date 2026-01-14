/**
 * Controls Component
 *
 * UI controls for exposure, tone mapping, and visualization modes.
 */

import type {
  RenderState,
  ToneMappingOperator,
  VisualizationMode,
  ColorSpace
} from '@dimkatet/hdr-image-renderer'

interface ControlsProps {
  renderState: RenderState;
  onRenderStateChange: (state: RenderState) => void;
  hdrAvailable: boolean;
}

export function Controls({ renderState, onRenderStateChange, hdrAvailable }: ControlsProps) {
  const handleExposureChange = (ev: number) => {
    onRenderStateChange({ ...renderState, exposure: ev });
  };

  const handleToneMappingChange = (operator: ToneMappingOperator) => {
    onRenderStateChange({ ...renderState, toneMapping: operator });
  };

  const handleVisualizationModeChange = (mode: VisualizationMode) => {
    onRenderStateChange({ ...renderState, visualizationMode: mode });
  };

  const handleHdrModeChange = (enabled: boolean) => {
    onRenderStateChange({ ...renderState, hdrMode: enabled });
  };

  const handleColorSpaceChange = (colorSpace: ColorSpace) => {
    onRenderStateChange({ ...renderState, colorSpace });
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
                backgroundColor: renderState.visualizationMode === mode ? '#4a9eff' : '#333',
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
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', cursor: hdrAvailable ? 'pointer' : 'not-allowed', opacity: hdrAvailable ? 1 : 0.5 }}>
          <input
            type="checkbox"
            checked={renderState.hdrMode}
            onChange={(e) => handleHdrModeChange(e.target.checked)}
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

      {/* Color Space */}
      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Color Space
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['srgb', 'display-p3'] as ColorSpace[]).map((cs) => (
            <button
              key={cs}
              onClick={() => handleColorSpaceChange(cs)}
              style={{
                padding: '8px 16px',
                backgroundColor: renderState.colorSpace === cs ? '#4a9eff' : '#333',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              {cs === 'srgb' ? 'sRGB' : cs === 'display-p3' ? 'Display P3' : 'BT.2020'}
            </button>
          ))}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#888', lineHeight: '1.4' }}>
          Color space for output. Display P3 uses matrix transform from BT.709.
        </p>
      </div>
    </div>
  );
}
