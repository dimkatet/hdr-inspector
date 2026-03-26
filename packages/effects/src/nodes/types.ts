import type { GradientStop, OutputType, Vec2 } from '../types'

// ---- Param interfaces (one per node variant) ----

export interface TextureInputParams {
  /** Optional label for display / debugging */
  readonly label?: string
}

export interface Noise2DParams {
  readonly frequency: number
  readonly seed: number
  readonly noiseType: 'value' | 'perlin' | 'simplex'
}

export interface FBMParams {
  readonly octaves: number
  readonly persistence: number
  readonly lacunarity: number
  readonly seed: number
}

export interface WarpParams {
  readonly strength: number
}

export interface TransformParams {
  readonly scale: Vec2
  readonly rotation: number
  readonly pivot: Vec2
}

export interface ColorTransformParams {
  readonly brightness: number
  readonly contrast: number
  readonly saturation: number
  readonly hue: number
}

export interface GradientMapParams {
  readonly stops: readonly GradientStop[]
}

export interface ChannelOffsetParams {
  readonly rOffset: Vec2
  readonly gOffset: Vec2
  readonly bOffset: Vec2
}

export interface ChannelMixParams {
  /** 4x4 channel mix matrix, row-major. Identity: diagonal 1s. */
  readonly matrix: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ]
}

export interface MixParams {
  /** Default blend factor when the `factor` input port is unconnected */
  readonly defaultFactor: number
}

export interface MaskParams {
  readonly threshold: number
  readonly invert: boolean
}

export type MathOp = 'add' | 'subtract' | 'multiply' | 'step' | 'clamp'

export interface MathParams {
  readonly op: MathOp
  readonly clampMin?: number
  readonly clampMax?: number
}

// ---- Node definitions (discriminated union) ----

interface NodeBase {
  readonly outputType: OutputType
  /** Declared input port names — used for connection validation in connect() */
  readonly inputPorts: readonly string[]
}

export interface TextureInputNode extends NodeBase {
  readonly type: 'source'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly []
  readonly params: TextureInputParams
}

export interface Noise2DNode extends NodeBase {
  readonly type: 'noise.2d'
  readonly outputType: 'scalar'
  readonly inputPorts: readonly []
  readonly params: Noise2DParams
}

export interface FBMNode extends NodeBase {
  readonly type: 'noise.fbm'
  readonly outputType: 'scalar'
  readonly inputPorts: readonly []
  readonly params: FBMParams
}

export interface WarpNode extends NodeBase {
  readonly type: 'geometry.warp'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['image', 'field']
  readonly params: WarpParams
}

export interface TransformNode extends NodeBase {
  readonly type: 'geometry.transform'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['image']
  readonly params: TransformParams
}

export interface ColorTransformNode extends NodeBase {
  readonly type: 'color.transform'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['image']
  readonly params: ColorTransformParams
}

export interface GradientMapNode extends NodeBase {
  readonly type: 'color.gradientMap'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['luminance']
  readonly params: GradientMapParams
}

export interface ChannelOffsetNode extends NodeBase {
  readonly type: 'channel.offset'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['image']
  readonly params: ChannelOffsetParams
}

export interface ChannelMixNode extends NodeBase {
  readonly type: 'channel.mix'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['a', 'b']
  readonly params: ChannelMixParams
}

export interface MixNode extends NodeBase {
  readonly type: 'utility.mix'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['a', 'b', 'factor']
  readonly params: MixParams
}

export interface MaskNode extends NodeBase {
  readonly type: 'utility.mask'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['image', 'mask']
  readonly params: MaskParams
}

export interface MathNode extends NodeBase {
  readonly type: 'utility.math'
  readonly outputType: 'scalar'
  readonly inputPorts: readonly ['a', 'b']
  readonly params: MathParams
}

/** Full discriminated union of all supported node variants */
export type EffectNode =
  | TextureInputNode
  | Noise2DNode
  | FBMNode
  | WarpNode
  | TransformNode
  | ColorTransformNode
  | GradientMapNode
  | ChannelOffsetNode
  | ChannelMixNode
  | MixNode
  | MaskNode
  | MathNode

/** String literal type-tag extracted from any EffectNode variant */
export type NodeTypeTag = EffectNode['type']
