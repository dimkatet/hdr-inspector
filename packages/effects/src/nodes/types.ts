import type { GradientStop, OutputType, Vec2 } from '../types';

// ---- Param interfaces (one per node variant) ----

export interface TextureInputParams {
  /** Optional label for display / debugging */
  readonly label?: string;
}

export interface Noise2DParams {
  readonly frequency: number;
  readonly seed: number;
  readonly noiseType: 'value' | 'perlin' | 'simplex';
  /** 'uv' — standard 2D noise; 'line' — constant per scanline (VHS/tape look) */
  readonly sampleDomain?: 'uv' | 'line';
}

export interface FBMParams {
  readonly frequency: number;
  readonly octaves: number;
  readonly persistence: number;
  readonly lacunarity: number;
  readonly seed: number;
}

export interface TransformParams {
  readonly scale: Vec2;
  readonly rotation: number;
  readonly pivot: Vec2;
}

export interface ChannelMixParams {
  /** 4x4 channel mix matrix, row-major. Identity: diagonal 1s. */
  readonly matrix: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
}

export interface WarpParams {
  readonly strength: number;
  readonly strengthY?: number;
}

export interface ColorTransformParams {
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly hue: number;
}

export interface GradientMapParams {
  readonly stops: readonly GradientStop[];
}

export interface ChannelOffsetParams {
  readonly rOffset: Vec2;
  readonly gOffset: Vec2;
  readonly bOffset: Vec2;
}

export interface MixParams {
  /** Default blend factor when the `factor` input port is unconnected */
  readonly defaultFactor: number;
}

export interface MaskParams {
  readonly threshold: number;
  readonly invert: boolean;
}

export type MathOp = 'add' | 'subtract' | 'multiply' | 'step' | 'clamp';

export interface MathParams {
  readonly op: MathOp;
  readonly clampMin?: number;
  readonly clampMax?: number;
}

// ---- Node definitions (discriminated union) ----

interface NodeBase {
  readonly outputType: OutputType;
  /** Declared input port names — used for connection validation in connect() */
  readonly inputPorts: readonly string[];
}

export interface TextureInputNode extends NodeBase {
  readonly type: 'source';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly [];
  readonly params: TextureInputParams;
}

export interface Noise2DNode extends NodeBase {
  readonly type: 'noise.2d';
  readonly outputType: 'scalar';
  readonly inputPorts: readonly [];
  readonly params: Noise2DParams;
}

export interface FBMNode extends NodeBase {
  readonly type: 'noise.fbm';
  readonly outputType: 'scalar';
  readonly inputPorts: readonly [];
  readonly params: FBMParams;
}

export interface WarpNode extends NodeBase {
  readonly type: 'geometry.warp';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image', 'field'];
  readonly params: WarpParams;
}

export interface ColorTransformNode extends NodeBase {
  readonly type: 'color.transform';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image'];
  readonly params: ColorTransformParams;
}

export interface GradientMapNode extends NodeBase {
  readonly type: 'color.gradientMap';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['luminance'];
  readonly params: GradientMapParams;
}

export interface ChannelOffsetNode extends NodeBase {
  readonly type: 'channel.offset';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image'];
  readonly params: ChannelOffsetParams;
}

export interface MixNode extends NodeBase {
  readonly type: 'utility.mix';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['a', 'b', 'factor'];
  readonly params: MixParams;
}

export interface MaskNode extends NodeBase {
  readonly type: 'utility.mask';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image', 'mask'];
  readonly params: MaskParams;
}

export interface MathNode extends NodeBase {
  readonly type: 'utility.math';
  readonly outputType: 'scalar';
  readonly inputPorts: readonly ['a', 'b'];
  readonly params: MathParams;
}

export interface PixelateParams {
  /** Number of blocks across each axis (e.g. 16 → 16×16 grid of pixels) */
  readonly blockSize: number;
}

export interface BlockWarpParams {
  /** Max horizontal displacement per block (UV units) */
  readonly strengthX: number;
  /** Max vertical displacement per block (UV units) */
  readonly strengthY: number;
  /** Seed — controls which blocks are displaced and in which direction */
  readonly seed: number;
}

export interface LumaMaskParams {
  /** smoothstep low edge — luma below this is 0 */
  readonly low: number;
  /** smoothstep high edge — luma above this is 1 */
  readonly high: number;
}

export interface DomainWarpParams {
  /** FBM base frequency */
  readonly frequency: number;
  /** First warp pass strength (UV units) */
  readonly strength1: number;
  /** Second warp pass strength — applied at already-warped UV (true domain warp) */
  readonly strength2: number;
  /** FBM octaves */
  readonly octaves: number;
  /** FBM persistence (amplitude decay per octave) */
  readonly persistence: number;
  /** Seed — offsets the noise lookup */
  readonly seed: number;
}

export interface VignetteParams {
  readonly strength: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
}

export interface VignetteNode extends NodeBase {
  readonly type: 'effect.vignette';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image'];
  readonly params: VignetteParams;
}

export type BlendMode = 'add' | 'multiply' | 'screen' | 'overlay';

export interface BlendParams {
  readonly mode: BlendMode;
  readonly intensity: number;
}

export interface BlendNode extends NodeBase {
  readonly type: 'utility.blend';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['a', 'b'];
  readonly params: BlendParams;
}

export interface PixelateNode extends NodeBase {
  readonly type: 'utility.pixelate';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image'];
  readonly params: PixelateParams;
}

export interface BlockWarpNode extends NodeBase {
  readonly type: 'geometry.blockWarp';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image'];
  readonly params: BlockWarpParams;
}

export interface LumaMaskNode extends NodeBase {
  readonly type: 'utility.lumaMask';
  readonly outputType: 'scalar';
  readonly inputPorts: readonly ['image'];
  readonly params: LumaMaskParams;
}

export interface DomainWarpNode extends NodeBase {
  readonly type: 'geometry.domainWarp';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image'];
  readonly params: DomainWarpParams;
}

/** Full discriminated union of all supported node variants */
export interface TransformNode extends NodeBase {
  readonly type: 'geometry.transform';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['image'];
  readonly params: TransformParams;
}

export interface ChannelMixNode extends NodeBase {
  readonly type: 'channel.mix';
  readonly outputType: 'rgba';
  readonly inputPorts: readonly ['a', 'b'];
  readonly params: ChannelMixParams;
}

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
  | VignetteNode
  | BlendNode
  | LumaMaskNode
  | DomainWarpNode
  | PixelateNode
  | BlockWarpNode;

/** String literal type-tag extracted from any EffectNode variant */
export type NodeTypeTag = EffectNode['type'];
