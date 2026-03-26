import { EffectGraph } from '../graph/Graph';
import type { NodeId } from '../types';

export interface AnalogVHSOptions {
  /** High-frequency noise for subtle scanline warp */
  readonly scanlineFreq: number;
  readonly scanlineStrength: number;
  /** Low-frequency noise for line tearing */
  readonly tearFreq: number;
  readonly tearStrength: number;
  /** Fraction of lines that tear — higher threshold = less tearing */
  readonly tearThreshold: number;
  /** Chromatic aberration per-channel offsets */
  readonly rOffset: readonly [number, number];
  readonly gOffset: readonly [number, number];
  readonly bOffset: readonly [number, number];
  /** Film grain */
  readonly grainFreq: number;
  readonly grainIntensity: number;
  /** Color fade: saturation and contrast adjustments */
  readonly saturation: number;
  readonly contrast: number;
  readonly brightness: number;
  /** Seeds */
  readonly seed1: number;
  readonly seed2: number;
  readonly seed3: number;
}

const DEFAULTS: AnalogVHSOptions = {
  scanlineFreq: 16.0,
  scanlineStrength: 0.008,
  tearFreq: 1.5,
  tearStrength: 0.12,
  tearThreshold: 0.82,
  rOffset: [0.006, 0.0],
  gOffset: [0.0, 0.0],
  bOffset: [-0.006, 0.0],
  grainFreq: 48.0,
  grainIntensity: 0.04,
  saturation: 0.75,
  contrast: 1.1,
  brightness: -0.03,
  seed1: 11,
  seed2: 53,
  seed3: 97,
};

/**
 * Analog VHS preset — layered scanline warp, line tearing, chromatic aberration,
 * film grain, and color fade.
 *
 * ```
 * noiseHi → warpScanline(source)
 * noiseLo → mask(threshold) ─────────────────────────────► mix(scanline, torn, mask)
 *         → warpTear(scanline)                                └─► channelOffset
 *                                                                  └─► blend(noiseGrain, add)
 *                                                                       └─► colorTransform → output
 * ```
 */
export function createAnalogVHS(options: Partial<AnalogVHSOptions> = {}): EffectGraph {
  const opts: AnalogVHSOptions = { ...DEFAULTS, ...options };
  const g = new EffectGraph();

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  });

  // ── Scanline warp ──────────────────────────────────────────────────────────
  const noiseHi: NodeId = g.addNode({
    type: 'noise.2d',
    outputType: 'scalar',
    inputPorts: [] as const,
    params: { frequency: opts.scanlineFreq, seed: opts.seed1, noiseType: 'perlin', sampleDomain: 'line' },
  });

  const warpScanline: NodeId = g.addNode({
    type: 'geometry.warp',
    outputType: 'rgba',
    inputPorts: ['image', 'field'] as const,
    params: { strength: opts.scanlineStrength },
  });
  g.connect(source, warpScanline, 'image');
  g.connect(noiseHi, warpScanline, 'field');

  // ── Line tearing ───────────────────────────────────────────────────────────
  const noiseLo: NodeId = g.addNode({
    type: 'noise.2d',
    outputType: 'scalar',
    inputPorts: [] as const,
    params: { frequency: opts.tearFreq, seed: opts.seed2, noiseType: 'perlin', sampleDomain: 'line' },
  });

  const tearMask: NodeId = g.addNode({
    type: 'utility.mask',
    outputType: 'rgba',
    inputPorts: ['image', 'mask'] as const,
    params: { threshold: opts.tearThreshold, invert: false },
  });
  g.connect(warpScanline, tearMask, 'image');
  g.connect(noiseLo, tearMask, 'mask');

  const warpTear: NodeId = g.addNode({
    type: 'geometry.warp',
    outputType: 'rgba',
    inputPorts: ['image', 'field'] as const,
    params: { strength: opts.tearStrength },
  });
  g.connect(warpScanline, warpTear, 'image');
  g.connect(noiseLo, warpTear, 'field');

  const torn: NodeId = g.addNode({
    type: 'utility.mix',
    outputType: 'rgba',
    inputPorts: ['a', 'b', 'factor'] as const,
    params: { defaultFactor: 0.5 },
  });
  g.connect(warpScanline, torn, 'a');
  g.connect(warpTear, torn, 'b');
  g.connect(tearMask, torn, 'factor');

  // ── Chromatic aberration ───────────────────────────────────────────────────
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
  g.connect(torn, chroma, 'image');

  // ── Film grain ─────────────────────────────────────────────────────────────
  const noiseGrain: NodeId = g.addNode({
    type: 'noise.2d',
    outputType: 'scalar',
    inputPorts: [] as const,
    params: { frequency: opts.grainFreq, seed: opts.seed3, noiseType: 'perlin' },
  });

  const grain: NodeId = g.addNode({
    type: 'utility.blend',
    outputType: 'rgba',
    inputPorts: ['a', 'b'] as const,
    params: { mode: 'add', intensity: opts.grainIntensity },
  });
  g.connect(chroma, grain, 'a');
  g.connect(noiseGrain, grain, 'b');

  // ── Color fade ─────────────────────────────────────────────────────────────
  const output: NodeId = g.addNode({
    type: 'color.transform',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      brightness: opts.brightness,
      contrast: opts.contrast,
      saturation: opts.saturation,
      hue: 0.0,
    },
  });
  g.connect(grain, output, 'image');

  g.setOutput(output);
  return g;
}
