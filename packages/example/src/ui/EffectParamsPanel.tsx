import type { ParamDescriptor, StepParamInfo } from '@dimkatet/effects-graph';

const NODE_TYPE_LABELS: Record<string, string> = {
  'noise.2d': 'Noise',
  'noise.fbm': 'FBM Noise',
  'geometry.warp': 'Warp',
  'geometry.blockWarp': 'Block Warp',
  'geometry.domainWarp': 'Domain Warp',
  'color.transform': 'Color',
  'color.gradientMap': 'Gradient Map',
  'utility.mask': 'Mask',
  'utility.lumaMask': 'Luma Mask',
  'utility.pixelate': 'Pixelate',
  'utility.math': 'Math',
  'channel.offset': 'Channel Offset',
  'utility.mix': 'Mix',
  'utility.blend': 'Blend',
  'effect.vignette': 'Vignette',
};

interface EffectParamsPanelProps {
  paramInfo: readonly StepParamInfo[];
  onUpdate: (stepId: string, name: string, value: unknown) => void;
  title?: string;
}

export function EffectParamsPanel({
  paramInfo,
  onUpdate,
  title = 'Effect Parameters',
}: EffectParamsPanelProps) {
  // Build labels for duplicate node types: "Noise 1", "Noise 2"
  const typeCounters = new Map<string, number>();
  const typeTotals = new Map<string, number>();
  for (const { nodeType } of paramInfo) {
    typeTotals.set(nodeType, (typeTotals.get(nodeType) ?? 0) + 1);
  }

  return (
    <div
      style={{
        backgroundColor: '#111',
        border: '1px solid #2a2a2a',
        borderRadius: 6,
        marginTop: 8,
        padding: '10px 14px',
        maxHeight: 380,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 10,
        }}
      >
        {title}
      </div>

      {paramInfo.map(({ stepId, nodeType, label, schema, values }) => {
        const idx = typeCounters.get(nodeType) ?? 0;
        typeCounters.set(nodeType, idx + 1);
        const total = typeTotals.get(nodeType) ?? 1;
        const sectionLabel =
          label ??
          (total > 1
            ? `${NODE_TYPE_LABELS[nodeType] ?? nodeType} ${idx + 1}`
            : (NODE_TYPE_LABELS[nodeType] ?? nodeType));

        const paramEntries = Object.entries(schema);
        if (paramEntries.length === 0) return null;

        return (
          <div key={stepId} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>{sectionLabel}</div>
            {paramEntries.map(([name, desc]) => (
              <ParamControl
                key={name}
                stepId={stepId}
                name={name}
                desc={desc}
                value={values[name]}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

interface ParamControlProps {
  stepId: string;
  name: string;
  desc: ParamDescriptor;
  value: unknown;
  onUpdate: (stepId: string, name: string, value: unknown) => void;
}

function ParamControl({ stepId, name, desc, value, onUpdate }: ParamControlProps) {
  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
    fontSize: 12,
  };
  const labelStyle = { color: '#aaa', minWidth: 90, flexShrink: 0 };
  const valueStyle = {
    color: '#fff',
    minWidth: 38,
    textAlign: 'right' as const,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums' as const,
  };
  const sliderStyle = { flex: 1, accentColor: '#8b5cf6', cursor: 'pointer' };

  switch (desc.type) {
    case 'number': {
      const num = typeof value === 'number' ? value : desc.default;
      return (
        <div style={rowStyle}>
          <span style={labelStyle}>{desc.label}</span>
          <input
            type="range"
            min={desc.min}
            max={desc.max}
            step={desc.step}
            value={num}
            style={sliderStyle}
            onChange={(e) => onUpdate(stepId, name, Number(e.target.value))}
          />
          <span style={valueStyle}>{formatNum(num, desc.step)}</span>
        </div>
      );
    }
    case 'boolean': {
      const bool = typeof value === 'boolean' ? value : desc.default;
      return (
        <label style={{ ...rowStyle, cursor: 'pointer' }}>
          <span style={labelStyle}>{desc.label}</span>
          <input
            type="checkbox"
            checked={bool}
            style={{ accentColor: '#8b5cf6', cursor: 'pointer', width: 14, height: 14 }}
            onChange={(e) => onUpdate(stepId, name, e.target.checked)}
          />
        </label>
      );
    }
    case 'vec2': {
      const vec = Array.isArray(value)
        ? (value as [number, number])
        : ([...desc.default] as [number, number]);
      return (
        <>
          <div style={rowStyle}>
            <span style={{ ...labelStyle, color: '#888' }}>{desc.label} X</span>
            <input
              type="range"
              min={desc.min}
              max={desc.max}
              step={desc.step}
              value={vec[0]}
              style={sliderStyle}
              onChange={(e) => onUpdate(stepId, name, [Number(e.target.value), vec[1]])}
            />
            <span style={valueStyle}>{formatNum(vec[0], desc.step)}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ ...labelStyle, color: '#888' }}>{desc.label} Y</span>
            <input
              type="range"
              min={desc.min}
              max={desc.max}
              step={desc.step}
              value={vec[1]}
              style={sliderStyle}
              onChange={(e) => onUpdate(stepId, name, [vec[0], Number(e.target.value)])}
            />
            <span style={valueStyle}>{formatNum(vec[1], desc.step)}</span>
          </div>
        </>
      );
    }
    case 'select': {
      const sel = typeof value === 'string' ? value : desc.default;
      return (
        <div style={rowStyle}>
          <span style={labelStyle}>{desc.label}</span>
          <select
            value={sel}
            style={{
              flex: 1,
              background: '#222',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: 3,
              padding: '2px 6px',
              cursor: 'pointer',
              fontSize: 12,
            }}
            onChange={(e) => onUpdate(stepId, name, e.target.value)}
          >
            {desc.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }
    default:
      return null;
  }
}

/** Format number based on step precision */
function formatNum(n: number, step: number): string {
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return n.toFixed(decimals);
}
