import { EffectGraph } from '../graph/Graph';
import type { NodeId } from '../types';

export interface DataGlitchOptions {
  /**
   * Mosaic block size (number of blocks across each axis).
   * Should match geometry.blockWarp's internal hardcoded gridSize (12) so
   * displaced cells shift whole mosaic blocks without cutting across
   * pixelation boundaries.
   */
  readonly blockSize: number;
  /** Per-block random displacement */
  readonly blockWarpStrengthX: number;
  readonly blockWarpStrengthY: number;
  readonly blockWarpSeed: number;
  /** Chromatic aberration */
  readonly rOffset: readonly [number, number];
  readonly bOffset: readonly [number, number];
  /** Noise used as spatial mask — controls where corruption clusters appear */
  readonly noiseFreq: number;
  readonly noiseSeed: number;
  /**
   * Luma mask smoothstep range — keep narrow (≤ 0.15) for hard-edged clusters
   * so block boundaries stay crisp at the mask edge.
   */
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
  blockSize: 12,            // matches geometry.blockWarp's hardcoded gridSize=12
  blockWarpStrengthX: 0.12,
  blockWarpStrengthY: 0.06,
  blockWarpSeed: 13,
  rOffset: [0.03, 0],
  bOffset: [-0.03, 0],
  noiseFreq: 5,             // must be < blockSize(12) so clusters span multiple blocks
  noiseSeed: 77,
  maskLow: 0.40,            // narrow range → near-binary mask → hard cluster edges
  maskHigh: 0.58,
  contrast: 1.15,           // low enough that non-displaced blocks stay close to source
  saturation: 1.3,
  hue: 0.4,
  mixFactor: 0.6,
};

/**
 * Data Glitch preset — pixelation + block displacement + color aberration,
 * revealed in localized clusters via a spatial noise mask.
 *
 * The noise mask defines WHERE corruption clusters appear; geometry.blockWarp
 * defines the block-shaped corruption within those clusters (~30% of its
 * 12×12 grid cells are displaced). pixelate uses the same grid size so each
 * displaced cell moves a whole mosaic block as a unit.
 *
 * Key parameters for clean block appearance:
 * - blockSize=12: aligns with blockWarp's internal grid
 * - noiseFreq < blockSize: noise clusters must be larger than blocks so the mask
 *   reveals whole blocks, not sub-block fragments. noiseFreq=5 → cluster ≈ 2-3 blocks wide.
 * - maskLow/maskHigh: narrow range (≤ 0.2) for hard cluster edges
 * - contrast: keep low (≤ 1.2) to avoid dark patches in non-displaced blocks
 *
 * ```
 * source → pixelate(12) → blockWarp → channelOffset → colorGrade ─── b ──┐
 * noise.2d → lumaMask ──────────────────────────────────────── factor ──── mix → output
 * source ───────────────────────────────────────────────────────── a ──────┘
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

  // blockSize=12 aligns with blockWarp's hardcoded 12×12 grid — displaced cells
  // shift whole mosaic blocks rather than cutting across pixelation boundaries.
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

  // Mild grade — contrast kept low so non-displaced blocks stay close to source
  // and don't produce dark patches when blended through the noise mask.
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

  // 2D noise defines where corruption clusters appear.
  // noise.2d outputs r=g=b=val, so lumaMask computes luma = val directly.
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

  // Narrow smoothstep range → near-binary mask → cluster edges stay hard so
  // block boundaries are not softened by partial blending at the mask edge.
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
