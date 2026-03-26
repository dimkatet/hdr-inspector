// Core value types
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
} from './types'
export { makeNodeId } from './types'

// Node type interfaces and discriminated union
export type {
  ChannelMixNode,
  ChannelMixParams,
  ChannelOffsetNode,
  ChannelOffsetParams,
  ColorTransformNode,
  ColorTransformParams,
  EffectNode,
  FBMNode,
  FBMParams,
  GradientMapNode,
  GradientMapParams,
  MaskNode,
  MaskParams,
  MathNode,
  MathOp,
  MathParams,
  MixNode,
  MixParams,
  Noise2DNode,
  Noise2DParams,
  NodeTypeTag,
  TextureInputNode,
  TextureInputParams,
  TransformNode,
  TransformParams,
  WarpNode,
  WarpParams,
} from './nodes/types'

// Graph class and serialization types
export { EffectGraph } from './graph/Graph'
export type {
  EffectGraphData,
  SerializedConnection,
  SerializedNode,
  ValidationError,
  ValidationResult,
} from './graph/Graph'

// Compiler
export { compile, CompileError } from './graph/compiler'
export type { ExecutionPlan, ExecutionStep } from './graph/compiler'

// Presets
export { createAnalogGlitch } from './presets/analogGlitch'
export type { AnalogGlitchOptions } from './presets/analogGlitch'

// Param descriptor system
export { NODE_PARAM_SCHEMAS } from './params'
export type {
  BoolParamDescriptor,
  NumberParamDescriptor,
  ParamDescriptor,
  ParamSchema,
  SelectParamDescriptor,
  StepParamInfo,
  Vec2ParamDescriptor,
} from './params'
