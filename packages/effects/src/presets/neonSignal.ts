import { EffectGraph } from '../graph/Graph';
import type { NodeId } from '../types';

export interface NeonSignalOptions {
  /** Scanline noise frequency — higher = thinner bands */
  readonly scanlineFreq: number;
  readonly scanlineSeed: number;
  /** Domain warp params */
  readonly warpFrequency: number;
  readonly warpStrength1: number;
  readonly warpStrength2: number;
  readonly warpOctaves: number;
  readonly warpSeed: number;
  /** Chromatic aberration */
  readonly rOffset: readonly [number, number];
  readonly gOffset: readonly [number, number];
  readonly bOffset: readonly [number, number];
  /** Luma mask range for selective grading */
  readonly maskLow: number;
  readonly maskHigh: number;
  /** Base grade — applied to shadows/midtones */
  readonly baseContrast: number;
  readonly baseSaturation: number;
  readonly baseHue: number;
  /** Neon grade — applied to highlights via luma mask */
  readonly neonContrast: number;
  readonly neonSaturation: number;
  readonly neonHue: number;
  /** Blend factor between base and neon layers (when luma mask = 0.5) */
  readonly gradeMix: number;
  /**
   * Final blend between original source and graded result.
   * Used as defaultFactor — overridden per-scanline by the line noise.
   */
  readonly signalMix: number;
}

const DEFAULTS: NeonSignalOptions = {
  scanlineFreq: 12.0,
  scanlineSeed: 21,
  warpFrequency: 2.0,
  warpStrength1: 0.06,
  warpStrength2: 0.03,
  warpOctaves: 3,
  warpSeed: 42,
  rOffset: [0.006, 0],
  gOffset: [0, 0],
  bOffset: [-0.006, 0],
  maskLow: 0.5,
  maskHigh: 0.85,
  baseContrast: 1.3,
  baseSaturation: 1.0,
  baseHue: -0.1,
  neonContrast: 2.0,
  neonSaturation: 2.0,
  neonHue: 0.8,
  gradeMix: 0.6,
  signalMix: 0.7,
};

/**
 * Neon Signal preset — domain-warped distortion with scanline-modulated neon grading.
 *
 * The luma mask blends two color grades selectively by brightness (shadows stay cool,
 * highlights turn warm/neon). Scanline noise then controls per-row how much of the
 * graded result bleeds through — producing a broadcast-signal glitch aesthetic.
 *
 * ```
 * source → domainWarp → channelOffset → colorBase ─────────────────── mix7(grade, lumaMask)
 *                                     → colorNeon ─────────────────────┘
 * source → lumaMask ──────────────────────────────── factor ──────────┘
 *
 * source ────────────────────────────── a ──── mix8(signal, scanlineNoise)
 * mix7 ───────────────────────────────── b ───┘
 * noise.2d(scanline) ─────────────────── factor ┘
 *                     ↓
 *                   output
 * ```
 */
export function createNeonSignal(options: Partial<NeonSignalOptions> = {}): EffectGraph {
  const opts: NeonSignalOptions = { ...DEFAULTS, ...options };
  const g = new EffectGraph();

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  });

  // ── Distortion ─────────────────────────────────────────────────────────────

  const domainWarp: NodeId = g.addNode({
    type: 'geometry.domainWarp',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      frequency: opts.warpFrequency,
      strength1: opts.warpStrength1,
      strength2: opts.warpStrength2,
      octaves: opts.warpOctaves,
      persistence: 0.5,
      seed: opts.warpSeed,
    },
  });
  g.connect(source, domainWarp, 'image');

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

  // ── Selective grading ──────────────────────────────────────────────────────

  const colorBase: NodeId = g.addNode({
    type: 'color.transform',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      brightness: 0.0,
      contrast: opts.baseContrast,
      saturation: opts.baseSaturation,
      hue: opts.baseHue,
    },
  });
  g.connect(chroma, colorBase, 'image');

  const colorNeon: NodeId = g.addNode({
    type: 'color.transform',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      brightness: 0.0,
      contrast: opts.neonContrast,
      saturation: opts.neonSaturation,
      hue: opts.neonHue,
    },
  });
  g.connect(chroma, colorNeon, 'image');

  // Luma mask from source — bright areas get neon, dark areas get base
  const lumaMask: NodeId = g.addNode({
    type: 'utility.lumaMask',
    outputType: 'scalar',
    inputPorts: ['image'] as const,
    params: { low: opts.maskLow, high: opts.maskHigh },
  });
  g.connect(source, lumaMask, 'image');

  // Blend base and neon by luma mask (node-7)
  const gradeMix: NodeId = g.addNode({
    type: 'utility.mix',
    outputType: 'rgba',
    inputPorts: ['a', 'b', 'factor'] as const,
    params: { defaultFactor: opts.gradeMix },
  });
  g.connect(colorBase, gradeMix, 'a');
  g.connect(colorNeon, gradeMix, 'b');
  g.connect(lumaMask, gradeMix, 'factor');

  // ── Scanline signal blend ──────────────────────────────────────────────────

  // Horizontal scanline noise — constant per row, varies row-to-row.
  // Used as the blend factor so different rows show different amounts
  // of the graded result vs the original source.
  const scanlineNoise: NodeId = g.addNode({
    type: 'noise.2d',
    outputType: 'scalar',
    inputPorts: [] as const,
    params: {
      frequency: opts.scanlineFreq,
      seed: opts.scanlineSeed,
      noiseType: 'perlin',
      sampleDomain: 'line',
    },
  });

  // Final mix: source (a) blended with graded result (b) — factor driven per-scanline (node-8)
  const output: NodeId = g.addNode({
    type: 'utility.mix',
    outputType: 'rgba',
    inputPorts: ['a', 'b', 'factor'] as const,
    params: { defaultFactor: opts.signalMix },
  });
  g.connect(source, output, 'a');
  g.connect(gradeMix, output, 'b');
  g.connect(scanlineNoise, output, 'factor');

  g.setOutput(output);
  return g;
}
