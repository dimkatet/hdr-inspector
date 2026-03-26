// ---------------------------------------------------------------------------
// Param descriptor types — metadata for UI control generation
// ---------------------------------------------------------------------------

export interface NumberParamDescriptor {
  readonly type: 'number'
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
}

export interface BoolParamDescriptor {
  readonly type: 'boolean'
  readonly label: string
  readonly default: boolean
}

export interface Vec2ParamDescriptor {
  readonly type: 'vec2'
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: readonly [number, number]
}

export interface SelectParamDescriptor<T extends string = string> {
  readonly type: 'select'
  readonly label: string
  readonly options: readonly T[]
  readonly default: T
}

export type ParamDescriptor =
  | NumberParamDescriptor
  | BoolParamDescriptor
  | Vec2ParamDescriptor
  | SelectParamDescriptor

export type ParamSchema = Record<string, ParamDescriptor>

// ---------------------------------------------------------------------------
// Per-step info returned by CompiledGraphPass.getParamInfo()
// ---------------------------------------------------------------------------

export interface StepParamInfo {
  readonly stepId: string
  readonly nodeType: string
  /** Optional human-readable label (from node params.label if present) */
  readonly label: string | undefined
  readonly schema: ParamSchema
  /** Current live values — reflects updates made via updateStepParam() */
  readonly values: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// NODE_PARAM_SCHEMAS
// User-editable params per node type. Viewport-managed fields (noise.2d
// zoom/panX/panY) are intentionally excluded — they are updated internally.
// ---------------------------------------------------------------------------

export const NODE_PARAM_SCHEMAS: Record<string, ParamSchema> = {
  'noise.2d': {
    frequency: { type: 'number', label: 'Frequency', min: 0.5, max: 32, step: 0.5, default: 4.0 },
    seed:      { type: 'number', label: 'Seed',      min: 0,   max: 100, step: 1,   default: 0   },
  },
  'geometry.warp': {
    strength: { type: 'number', label: 'Strength', min: 0, max: 0.5, step: 0.005, default: 0.05 },
  },
  'utility.mask': {
    threshold: { type: 'number',  label: 'Threshold', min: 0, max: 1, step: 0.01, default: 0.5  },
    invert:    { type: 'boolean', label: 'Invert',                                 default: false },
  },
  'channel.offset': {
    rOffset: { type: 'vec2', label: 'R offset', min: -0.1, max: 0.1, step: 0.001, default: [0, 0] },
    gOffset: { type: 'vec2', label: 'G offset', min: -0.1, max: 0.1, step: 0.001, default: [0, 0] },
    bOffset: { type: 'vec2', label: 'B offset', min: -0.1, max: 0.1, step: 0.001, default: [0, 0] },
  },
  'utility.mix': {
    defaultFactor: { type: 'number', label: 'Mix', min: 0, max: 1, step: 0.01, default: 0.5 },
  },
}
