// Core value types

export type { ExecutionPlan, ExecutionStep } from './graph/compiler';
// Compiler
export { CompileError, compile } from './graph/compiler';
export type {
  EffectGraphData,
  SerializedConnection,
  SerializedNode,
  ValidationError,
  ValidationResult,
} from './graph/Graph';

// Graph class and serialization types
export { EffectGraph } from './graph/Graph';
// Node type interfaces and discriminated union
export type {
  BlendMode,
  BlendNode,
  BlendParams,
  BlockWarpNode,
  BlockWarpParams,
  ChannelMixNode,
  ChannelMixParams,
  ChannelOffsetNode,
  ChannelOffsetParams,
  ColorTransformNode,
  ColorTransformParams,
  DomainWarpNode,
  DomainWarpParams,
  EffectNode,
  FBMNode,
  FBMParams,
  GradientMapNode,
  GradientMapParams,
  LumaMaskNode,
  LumaMaskParams,
  MaskNode,
  MaskParams,
  MathNode,
  MathOp,
  MathParams,
  MixNode,
  MixParams,
  NodeTypeTag,
  Noise2DNode,
  Noise2DParams,
  PixelateNode,
  PixelateParams,
  TextureInputNode,
  TextureInputParams,
  TransformNode,
  TransformParams,
  VignetteNode,
  VignetteParams,
  WarpNode,
  WarpParams,
} from './nodes/types';
export type {
  BoolParamDescriptor,
  NumberParamDescriptor,
  ParamDescriptor,
  ParamSchema,
  SelectParamDescriptor,
  StepParamInfo,
  Vec2ParamDescriptor,
} from './params';
// Param descriptor system
export { NODE_PARAM_SCHEMAS } from './params';
// Presets
export type { AnalogGlitchOptions } from './presets/analogGlitch';
export { createAnalogGlitch } from './presets/analogGlitch';
export type { AnalogVHSOptions } from './presets/analogVHS';
export { createAnalogVHS } from './presets/analogVHS';
export type { CyberpunkOptions } from './presets/cyberpunk';
export { createCyberpunk } from './presets/cyberpunk';
export type { DataGlitchOptions } from './presets/dataGlitch';
export { createDataGlitch } from './presets/dataGlitch';
export type { DuotoneOptions } from './presets/duotone';
export { createDuotone } from './presets/duotone';
export type { FilmGrainOptions } from './presets/filmGrain';
export { createFilmGrain } from './presets/filmGrain';
export type { LiquidGlitchOptions } from './presets/liquidGlitch';
export { createLiquidGlitch } from './presets/liquidGlitch';
export type { NeonSignalOptions } from './presets/neonSignal';
export { createNeonSignal } from './presets/neonSignal';
export type { VignetteOptions } from './presets/vignette';
export { createVignette } from './presets/vignette';
export type {
  ColorRGBA,
  Connection,
  GradientStop,
  NodeId,
  OutputType,
  ParamValue,
  Vec2,
  Vec3,
  Vec4,
} from './types';
export { makeNodeId } from './types';
