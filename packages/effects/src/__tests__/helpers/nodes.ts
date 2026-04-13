/**
 * Shared node-creation helpers used across tests.
 * Every helper returns a fully-typed EffectNode ready for g.addNode().
 */
import type {
  BlendNode,
  BlockWarpNode,
  ChannelOffsetNode,
  ColorTransformNode,
  DomainWarpNode,
  FBMNode,
  GradientMapNode,
  LumaMaskNode,
  MaskNode,
  MathNode,
  MixNode,
  Noise2DNode,
  PixelateNode,
  TextureInputNode,
  VignetteNode,
  WarpNode,
} from '../../nodes/types'

export const sourceNode = (): TextureInputNode => ({
  type: 'source',
  outputType: 'rgba',
  inputPorts: [],
  params: {},
})

export const noise2dNode = (
  overrides: Partial<Noise2DNode['params']> = {}
): Noise2DNode => ({
  type: 'noise.2d',
  outputType: 'scalar',
  inputPorts: [],
  params: { frequency: 4.0, seed: 0, noiseType: 'perlin', ...overrides },
})

export const fbmNode = (overrides: Partial<FBMNode['params']> = {}): FBMNode => ({
  type: 'noise.fbm',
  outputType: 'scalar',
  inputPorts: [],
  params: {
    frequency: 2.0,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0,
    seed: 0,
    ...overrides,
  },
})

export const warpNode = (overrides: Partial<WarpNode['params']> = {}): WarpNode => ({
  type: 'geometry.warp',
  outputType: 'rgba',
  inputPorts: ['image', 'field'],
  params: { strength: 0.05, ...overrides },
})

export const colorTransformNode = (
  overrides: Partial<ColorTransformNode['params']> = {}
): ColorTransformNode => ({
  type: 'color.transform',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: { brightness: 0, contrast: 1, saturation: 1, hue: 0, ...overrides },
})

export const channelOffsetNode = (
  overrides: Partial<ChannelOffsetNode['params']> = {}
): ChannelOffsetNode => ({
  type: 'channel.offset',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: {
    rOffset: [0.005, 0],
    gOffset: [0, 0],
    bOffset: [-0.005, 0],
    ...overrides,
  },
})

export const mixNode = (overrides: Partial<MixNode['params']> = {}): MixNode => ({
  type: 'utility.mix',
  outputType: 'rgba',
  inputPorts: ['a', 'b', 'factor'],
  params: { defaultFactor: 0.5, ...overrides },
})

export const maskNode = (overrides: Partial<MaskNode['params']> = {}): MaskNode => ({
  type: 'utility.mask',
  outputType: 'rgba',
  inputPorts: ['image', 'mask'],
  params: { threshold: 0.5, invert: false, ...overrides },
})

export const mathNode = (overrides: Partial<MathNode['params']> = {}): MathNode => ({
  type: 'utility.math',
  outputType: 'scalar',
  inputPorts: ['a', 'b'],
  params: { op: 'add', ...overrides },
})

export const blendNode = (overrides: Partial<BlendNode['params']> = {}): BlendNode => ({
  type: 'utility.blend',
  outputType: 'rgba',
  inputPorts: ['a', 'b'],
  params: { mode: 'add', intensity: 1.0, ...overrides },
})

export const lumaMaskNode = (
  overrides: Partial<LumaMaskNode['params']> = {}
): LumaMaskNode => ({
  type: 'utility.lumaMask',
  outputType: 'scalar',
  inputPorts: ['image'],
  params: { low: 0.3, high: 0.7, ...overrides },
})

export const pixelateNode = (
  overrides: Partial<PixelateNode['params']> = {}
): PixelateNode => ({
  type: 'utility.pixelate',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: { blockSize: 16, ...overrides },
})

export const blockWarpNode = (
  overrides: Partial<BlockWarpNode['params']> = {}
): BlockWarpNode => ({
  type: 'geometry.blockWarp',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: { strengthX: 0.1, strengthY: 0.05, seed: 0, ...overrides },
})

export const domainWarpNode = (
  overrides: Partial<DomainWarpNode['params']> = {}
): DomainWarpNode => ({
  type: 'geometry.domainWarp',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: {
    frequency: 2,
    strength1: 0.04,
    strength2: 0.08,
    octaves: 3,
    persistence: 0.5,
    seed: 0,
    ...overrides,
  },
})

export const vignetteNode = (
  overrides: Partial<VignetteNode['params']> = {}
): VignetteNode => ({
  type: 'effect.vignette',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: { strength: 0.8, innerRadius: 0.4, outerRadius: 1.1, ...overrides },
})

export const gradientMapNode = (
  overrides: Partial<GradientMapNode['params']> = {}
): GradientMapNode => ({
  type: 'color.gradientMap',
  outputType: 'rgba',
  inputPorts: ['luminance'],
  params: {
    stops: [
      { t: 0, color: [0, 0, 0, 1] },
      { t: 1, color: [1, 1, 1, 1] },
    ],
    ...overrides,
  },
})
