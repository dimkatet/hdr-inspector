import { EffectGraph } from '../graph/Graph';
import type { NodeId } from '../types';

export interface DataGlitchOptions {
  /** Mosaic block size (number of blocks across each axis) */
  readonly blockSize: number;
  /** Per-block random displacement */
  readonly blockWarpStrengthX: number;
  readonly blockWarpStrengthY: number;
  readonly blockWarpSeed: number;
  /** Chromatic aberration */
  readonly rOffset: readonly [number, number];
  readonly bOffset: readonly [number, number];
  /** High-frequency noise used as spatial blend mask */
  readonly noiseFreq: number;
  readonly noiseSeed: number;
  /** Luma mask applied to noise — controls mask density */
  readonly maskLow: number;
  readonly maskHigh: number;
  /** Color grade on the glitched layer */
  readonly contrast: number;
  readonly saturation: number;
  readonly hue: number;
  /** Final blend factor (overridden per-pixel by the noise mask) */
  readonly mixFactor: number;
}

const DEFAULTS: DataGlitchOptions = {
  blockSize: 16,
  blockWarpStrengthX: 0.12,
  blockWarpStrengthY: 0.06,
  blockWarpSeed: 13,
  rOffset: [0.03, 0],
  bOffset: [-0.03, 0],
  noiseFreq: 20,
  noiseSeed: 77,
  maskLow: 0.4,
  maskHigh: 0.8,
  contrast: 1.8,
  saturation: 1.5,
  hue: 0.4,
  mixFactor: 0.6,
};

/**
 * Data Glitch preset — pixelation + block displacement + color aberration,
 * revealed through a spatially-varying noise mask.
 *
 * The noise (freq 20, 2D) is passed through utility.lumaMask to produce a
 * smoothstep-shaped spatial mask. This mask controls which pixels show the
 * glitched/colorized version vs the original — giving irregular "corruption
 * clusters" rather than a uniform blend.
 *
 * ```
 * source → pixelate → blockWarp → channelOffset → colorTransform → mix(b)
 * noise.2d → lumaMask ─────────────────────────────────── factor → mix
 * source ──────────────────────────────────────────────────── a → mix → output
 * ```
 */
export function createDataGlitch(options: Partial<DataGlitchOptions> = {}): EffectGraph {
  const opts: DataGlitchOptions = { ...DEFAULTS, ...options };
  const g = new EffectGraph();

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  });

  // ── Distortion chain ───────────────────────────────────────────────────────

  const pixelate: NodeId = g.addNode({
    type: 'utility.pixelate',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: { blockSize: opts.blockSize },
  });
  g.connect(source, pixelate, 'image');

  const blockWarp: NodeId = g.addNode({
    type: 'geometry.blockWarp',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      strengthX: opts.blockWarpStrengthX,
      strengthY: opts.blockWarpStrengthY,
      seed: opts.blockWarpSeed,
    },
  });
  g.connect(pixelate, blockWarp, 'image');

  const chroma: NodeId = g.addNode({
    type: 'channel.offset',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      rOffset: opts.rOffset,
      gOffset: [0, 0],
      bOffset: opts.bOffset,
    },
  });
  g.connect(blockWarp, chroma, 'image');

  const colorGrade: NodeId = g.addNode({
    type: 'color.transform',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      brightness: 0.0,
      contrast: opts.contrast,
      saturation: opts.saturation,
      hue: opts.hue,
    },
  });
  g.connect(chroma, colorGrade, 'image');

  // ── Spatial mask ───────────────────────────────────────────────────────────

  // High-frequency 2D noise produces an irregular spatial pattern
  const noise: NodeId = g.addNode({
    type: 'noise.2d',
    outputType: 'scalar',
    inputPorts: [] as const,
    params: {
      frequency: opts.noiseFreq,
      seed: opts.noiseSeed,
      noiseType: 'perlin',
      sampleDomain: 'uv',
    },
  });

  // smoothstep on noise → soft-edged mask of "corrupt clusters"
  const noiseMask: NodeId = g.addNode({
    type: 'utility.lumaMask',
    outputType: 'scalar',
    inputPorts: ['image'] as const,
    params: { low: opts.maskLow, high: opts.maskHigh },
  });
  g.connect(noise, noiseMask, 'image');

  // ── Final blend ────────────────────────────────────────────────────────────

  const output: NodeId = g.addNode({
    type: 'utility.mix',
    outputType: 'rgba',
    inputPorts: ['a', 'b', 'factor'] as const,
    params: { defaultFactor: opts.mixFactor },
  });
  g.connect(source, output, 'a');
  g.connect(colorGrade, output, 'b');
  g.connect(noiseMask, output, 'factor');

  g.setOutput(output);
  return g;
}
