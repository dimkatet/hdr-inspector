// ---------------------------------------------------------------------------
// Param descriptor types — metadata for UI control generation
// ---------------------------------------------------------------------------

export interface NumberParamDescriptor {
  readonly type: 'number';
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

export interface BoolParamDescriptor {
  readonly type: 'boolean';
  readonly label: string;
  readonly default: boolean;
}

export interface Vec2ParamDescriptor {
  readonly type: 'vec2';
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: readonly [number, number];
}

export interface SelectParamDescriptor<T extends string = string> {
  readonly type: 'select';
  readonly label: string;
  readonly options: readonly T[];
  readonly default: T;
}

export type ParamDescriptor =
  | NumberParamDescriptor
  | BoolParamDescriptor
  | Vec2ParamDescriptor
  | SelectParamDescriptor;

export type ParamSchema = Record<string, ParamDescriptor>;

// ---------------------------------------------------------------------------
// Per-step info returned by CompiledGraphPass.getParamInfo()
// ---------------------------------------------------------------------------

export interface StepParamInfo {
  readonly stepId: string;
  readonly nodeType: string;
  /** Optional human-readable label (from node params.label if present) */
  readonly label: string | undefined;
  readonly schema: ParamSchema;
  /** Current live values — reflects updates made via updateStepParam() */
  readonly values: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// NODE_PARAM_SCHEMAS
// User-editable params per node type. Viewport-managed fields (noise.2d
// zoom/panX/panY) are intentionally excluded — they are updated internally.
// ---------------------------------------------------------------------------

export const NODE_PARAM_SCHEMAS: Record<string, ParamSchema> = {
  'noise.2d': {
    frequency: { type: 'number', label: 'Frequency', min: 0.5, max: 32, step: 0.5, default: 4.0 },
    seed: { type: 'number', label: 'Seed', min: 0, max: 100, step: 1, default: 0 },
    sampleDomain: { type: 'select', label: 'Sample Domain', options: ['uv', 'line'], default: 'uv' },
  },
  'noise.fbm': {
    frequency: { type: 'number', label: 'Frequency', min: 0.5, max: 16, step: 0.5, default: 3.0 },
    octaves: { type: 'number', label: 'Octaves', min: 1, max: 8, step: 1, default: 4 },
    persistence: { type: 'number', label: 'Persistence', min: 0, max: 1, step: 0.05, default: 0.5 },
    lacunarity: { type: 'number', label: 'Lacunarity', min: 1, max: 4, step: 0.1, default: 2.0 },
    seed: { type: 'number', label: 'Seed', min: 0, max: 100, step: 1, default: 0 },
  },
  'geometry.warp': {
    strength: {
      type: 'number',
      label: 'Strength X',
      min: -0.5,
      max: 0.5,
      step: 0.005,
      default: 0.05,
    },
    strengthY: {
      type: 'number',
      label: 'Strength Y',
      min: -0.5,
      max: 0.5,
      step: 0.005,
      default: 0.0,
    },
  },
  'color.transform': {
    brightness: { type: 'number', label: 'Brightness', min: -1, max: 1, step: 0.01, default: 0.0 },
    contrast: { type: 'number', label: 'Contrast', min: 0, max: 4, step: 0.05, default: 1.0 },
    saturation: { type: 'number', label: 'Saturation', min: 0, max: 3, step: 0.05, default: 1.0 },
    hue: {
      type: 'number',
      label: 'Hue (rad)',
      min: -Math.PI,
      max: Math.PI,
      step: 0.05,
      default: 0.0,
    },
  },
  'utility.mask': {
    threshold: { type: 'number', label: 'Threshold', min: 0, max: 1, step: 0.01, default: 0.5 },
    invert: { type: 'boolean', label: 'Invert', default: false },
  },
  'utility.math': {
    op: {
      type: 'select',
      label: 'Operation',
      options: ['add', 'subtract', 'multiply', 'step', 'clamp'],
      default: 'add',
    },
    clampMin: { type: 'number', label: 'Clamp min', min: 0, max: 1, step: 0.01, default: 0.0 },
    clampMax: { type: 'number', label: 'Clamp max', min: 0, max: 1, step: 0.01, default: 1.0 },
  },
  'channel.offset': {
    rOffset: { type: 'vec2', label: 'R offset', min: -0.1, max: 0.1, step: 0.001, default: [0, 0] },
    gOffset: { type: 'vec2', label: 'G offset', min: -0.1, max: 0.1, step: 0.001, default: [0, 0] },
    bOffset: { type: 'vec2', label: 'B offset', min: -0.1, max: 0.1, step: 0.001, default: [0, 0] },
  },
  'utility.mix': {
    defaultFactor: { type: 'number', label: 'Mix', min: 0, max: 1, step: 0.01, default: 0.5 },
  },
  'utility.blend': {
    mode: {
      type: 'select',
      label: 'Mode',
      options: ['add', 'multiply', 'screen', 'overlay'],
      default: 'add',
    },
    intensity: { type: 'number', label: 'Intensity', min: 0, max: 2, step: 0.01, default: 1.0 },
  },
  'utility.pixelate': {
    blockSize: { type: 'number', label: 'Block Size', min: 4, max: 32, step: 1, default: 16 },
  },
  'geometry.blockWarp': {
    strengthX: { type: 'number', label: 'Strength X', min: 0, max: 0.3, step: 0.01, default: 0.1 },
    strengthY: { type: 'number', label: 'Strength Y', min: 0, max: 0.3, step: 0.01, default: 0.05 },
    seed: { type: 'number', label: 'Seed', min: 0, max: 100, step: 1, default: 13 },
  },
  'utility.lumaMask': {
    low: { type: 'number', label: 'Low edge', min: 0, max: 1, step: 0.01, default: 0.5 },
    high: { type: 'number', label: 'High edge', min: 0, max: 1, step: 0.01, default: 0.9 },
  },
  'geometry.domainWarp': {
    frequency: { type: 'number', label: 'Frequency', min: 0.5, max: 8, step: 0.25, default: 3.0 },
    strength1: { type: 'number', label: 'Strength 1', min: 0, max: 0.3, step: 0.005, default: 0.04 },
    strength2: { type: 'number', label: 'Strength 2', min: 0, max: 0.3, step: 0.005, default: 0.08 },
    octaves: { type: 'number', label: 'Octaves', min: 1, max: 6, step: 1, default: 4 },
    persistence: { type: 'number', label: 'Persistence', min: 0, max: 1, step: 0.05, default: 0.5 },
    seed: { type: 'number', label: 'Seed', min: 0, max: 100, step: 1, default: 0 },
  },
  'effect.vignette': {
    strength: { type: 'number', label: 'Strength', min: 0, max: 1, step: 0.01, default: 0.8 },
    innerRadius: {
      type: 'number',
      label: 'Inner radius',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.4,
    },
    outerRadius: {
      type: 'number',
      label: 'Outer radius',
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.9,
    },
  },
};
