import { EffectGraph } from '../graph/Graph';
import type { NodeId } from '../types';

export interface LiquidGlitchOptions {
  /** FBM base frequency — controls scale of distortion */
  readonly frequency: number;
  /** FBM octaves — more = more detail */
  readonly octaves: number;
  /** FBM persistence — amplitude falloff per octave */
  readonly persistence: number;
  /** First warp pass strength (UV units) */
  readonly strength1: number;
  /** Second warp pass strength — applied at warped UV (true domain warp) */
  readonly strength2: number;
  /** Blend factor: 0 = original, 1 = fully distorted */
  readonly mixFactor: number;
  /** Per-channel offsets for chromatic aberration */
  readonly rOffset: readonly [number, number];
  readonly gOffset: readonly [number, number];
  readonly bOffset: readonly [number, number];
  /** FBM seed */
  readonly seed: number;
}

const DEFAULTS: LiquidGlitchOptions = {
  frequency: 2.0,
  octaves: 3,
  persistence: 0.5,
  strength1: 0.04,
  strength2: 0.08,
  mixFactor: 0.7,
  rOffset: [0.004, 0.0],
  gOffset: [0.0, 0.0],
  bOffset: [-0.004, 0.0],
  seed: 7,
};

/**
 * Liquid Glitch preset — two-pass domain-warped FBM distortion with chromatic aberration.
 *
 * Uses geometry.domainWarp which internally evaluates FBM at the already-warped UV
 * for the second pass, producing coherent fluid-like distortion.
 *
 * ```
 * source → domainWarp → channelOffset → mix(source, distorted, factor)
 * ```
 */
export function createLiquidGlitch(options: Partial<LiquidGlitchOptions> = {}): EffectGraph {
  const opts: LiquidGlitchOptions = { ...DEFAULTS, ...options };
  const g = new EffectGraph();

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  });

  // Two-pass domain warp — FBM is self-referential, giving fluid-like distortion
  const domainWarp: NodeId = g.addNode({
    type: 'geometry.domainWarp',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      frequency: opts.frequency,
      octaves: opts.octaves,
      persistence: opts.persistence,
      strength1: opts.strength1,
      strength2: opts.strength2,
      seed: opts.seed,
    },
  });
  g.connect(source, domainWarp, 'image');

  // Chromatic aberration on the warped result
  const chroma: NodeId = g.addNode({
    type: 'channel.offset',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      rOffset: opts.rOffset,
      gOffset: opts.gOffset,
      bOffset: opts.bOffset,
    },
  });
  g.connect(domainWarp, chroma, 'image');

  // Blend original with distorted
  const output: NodeId = g.addNode({
    type: 'utility.mix',
    outputType: 'rgba',
    inputPorts: ['a', 'b', 'factor'] as const,
    params: { defaultFactor: opts.mixFactor },
  });
  g.connect(source, output, 'a');
  g.connect(chroma, output, 'b');

  g.setOutput(output);
  return g;
}
