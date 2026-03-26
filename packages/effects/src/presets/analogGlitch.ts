import { EffectGraph } from '../graph/Graph'
import type { NodeId } from '../types'

export interface AnalogGlitchOptions {
  /** High-frequency noise for the subtle warp */
  readonly highFreq: number
  /** Low-frequency noise for the mask and large shift */
  readonly lowFreq: number
  /** Warp strength for the initial subtle distortion */
  readonly subtleStrength: number
  /** Warp strength for the heavy glitch shift */
  readonly largeStrength: number
  /** Mask threshold in [0, 1] */
  readonly threshold: number
  /** Per-channel UV offsets for chromatic aberration */
  readonly rOffset: readonly [number, number]
  readonly gOffset: readonly [number, number]
  readonly bOffset: readonly [number, number]
  /** Seeds for reproducible noise */
  readonly seed1: number
  readonly seed2: number
}

const DEFAULTS: AnalogGlitchOptions = {
  highFreq: 12.0,
  lowFreq: 2.0,
  subtleStrength: 0.02,
  largeStrength: 0.15,
  threshold: 0.5,
  rOffset: [0.005, 0.0],
  gOffset: [0.0, 0.0],
  bOffset: [-0.005, 0.0],
  seed1: 42,
  seed2: 137,
}

/**
 * Returns a pre-built EffectGraph that implements the analog glitch composition:
 *
 * ```
 * noise1  = Noise(freq=high)
 * noise2  = Noise(freq=low)
 * warp    = Warp(source, noise1, subtleStrength)
 * mask    = Mask(warp, noise2, threshold)
 * shifted = Warp(warp, noise2, largeStrength)
 * rgb     = ChannelOffset(shifted, offsets)
 * output  = Mix(warp, rgb, mask)
 * ```
 *
 * The graph is valid and ready to be passed directly to `compile()`.
 *
 * Note: `mask` (outputType: rgba) feeds the `factor` port of `utility.mix`.
 * The Phase 2 WebGPU adapter will sample the r-channel as the blend factor.
 */
export function createAnalogGlitch(options: Partial<AnalogGlitchOptions> = {}): EffectGraph {
  const opts: AnalogGlitchOptions = { ...DEFAULTS, ...options }
  const g = new EffectGraph()

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  })

  const noise1: NodeId = g.addNode({
    type: 'noise.2d',
    outputType: 'scalar',
    inputPorts: [] as const,
    params: { frequency: opts.highFreq, seed: opts.seed1, noiseType: 'perlin' },
  })

  const noise2: NodeId = g.addNode({
    type: 'noise.2d',
    outputType: 'scalar',
    inputPorts: [] as const,
    params: { frequency: opts.lowFreq, seed: opts.seed2, noiseType: 'perlin' },
  })

  // Subtle warp of source driven by high-frequency noise
  const warp: NodeId = g.addNode({
    type: 'geometry.warp',
    outputType: 'rgba',
    inputPorts: ['image', 'field'] as const,
    params: { strength: opts.subtleStrength },
  })
  g.connect(source, warp, 'image')
  g.connect(noise1, warp, 'field')

  // Mask: pixels where noise2 exceeds threshold
  const mask: NodeId = g.addNode({
    type: 'utility.mask',
    outputType: 'rgba',
    inputPorts: ['image', 'mask'] as const,
    params: { threshold: opts.threshold, invert: false },
  })
  g.connect(warp, mask, 'image')
  g.connect(noise2, mask, 'mask')

  // Large shift of warp driven by low-frequency noise
  const shifted: NodeId = g.addNode({
    type: 'geometry.warp',
    outputType: 'rgba',
    inputPorts: ['image', 'field'] as const,
    params: { strength: opts.largeStrength },
  })
  g.connect(warp, shifted, 'image')
  g.connect(noise2, shifted, 'field')

  // Chromatic aberration on the shifted image
  const rgb: NodeId = g.addNode({
    type: 'channel.offset',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      rOffset: opts.rOffset,
      gOffset: opts.gOffset,
      bOffset: opts.bOffset,
    },
  })
  g.connect(shifted, rgb, 'image')

  // Final blend: mix original warp with aberrated version, modulated by mask
  const output: NodeId = g.addNode({
    type: 'utility.mix',
    outputType: 'rgba',
    inputPorts: ['a', 'b', 'factor'] as const,
    params: { defaultFactor: 0.5 },
  })
  g.connect(warp, output, 'a')
  g.connect(rgb, output, 'b')
  g.connect(mask, output, 'factor')

  g.setOutput(output)
  return g
}
