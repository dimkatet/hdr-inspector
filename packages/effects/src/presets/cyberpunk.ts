import { EffectGraph } from '../graph/Graph';
import type { GradientStop, NodeId } from '../types';

export interface CyberpunkOptions {
  /** Base layer — applied to shadows/midtones */
  readonly baseContrast: number;
  readonly baseSaturation: number;
  /** Hue shift in radians (negative = toward blue) */
  readonly baseHue: number;
  /** Neon layer — applied to highlights, mixed in via luma mask */
  readonly neonContrast: number;
  readonly neonSaturation: number;
  /** Hue shift in radians (positive = toward magenta/purple) */
  readonly neonHue: number;
  /** Luma mask smoothstep range: pixels below low → base, above high → neon */
  readonly maskLow: number;
  readonly maskHigh: number;
  /** Gradient stops — maps luminance of neon layer to palette colors */
  readonly gradientStops: readonly GradientStop[];
  /** Chromatic aberration */
  readonly rOffset: readonly [number, number];
  readonly gOffset: readonly [number, number];
  readonly bOffset: readonly [number, number];
}

const NEON_GRADIENT: readonly GradientStop[] = [
  { t: 0.0, color: [0.0, 0.0, 0.04, 1.0] },  // near-black, deep blue
  { t: 0.3, color: [0.35, 0.0, 0.7, 1.0] },   // purple
  { t: 0.6, color: [0.9, 0.0, 0.45, 1.0] },   // hot pink
  { t: 0.8, color: [0.0, 0.8, 0.9, 1.0] },    // cyan
  { t: 1.0, color: [0.9, 1.0, 1.0, 1.0] },    // near-white cyan
];

const DEFAULTS: CyberpunkOptions = {
  baseContrast: 1.2,
  baseSaturation: 0.8,
  baseHue: -0.2,
  neonContrast: 2.2,
  neonSaturation: 2.5,
  neonHue: 0.5,
  maskLow: 0.5,
  maskHigh: 0.85,
  gradientStops: NEON_GRADIENT,
  rOffset: [0.005, 0.0],
  gOffset: [0.0, 0.0],
  bOffset: [-0.005, 0.0],
};

/**
 * Cyberpunk preset — selective neon grading via luminance mask.
 *
 * Dark/midtone areas get a desaturated blue-tinted base grade.
 * Bright areas get a high-contrast neon gradient map.
 * The luma mask blends the two layers, so the effect is localized to highlights.
 *
 * ```
 * source → colorBase ──────────────────────────────────────── mix(base, neon, mask)
 * source → colorNeon → gradientMap(neon stops) ──────────────┘                    → channelOffset
 * source → lumaMask ─────────────────────────────────── mask ┘
 * ```
 */
export function createCyberpunk(options: Partial<CyberpunkOptions> = {}): EffectGraph {
  const opts: CyberpunkOptions = { ...DEFAULTS, ...options };
  const g = new EffectGraph();

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  });

  // Base layer — subtle grade for shadows and midtones
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
  g.connect(source, colorBase, 'image');

  // Neon layer — high contrast for highlight areas
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
  g.connect(source, colorNeon, 'image');

  // Map neon layer luminance through gradient palette
  const neonGrad: NodeId = g.addNode({
    type: 'color.gradientMap',
    outputType: 'rgba',
    inputPorts: ['luminance'] as const,
    params: { stops: opts.gradientStops },
  });
  g.connect(colorNeon, neonGrad, 'luminance');

  // Luma mask from source — bright pixels → 1 (neon), dark pixels → 0 (base)
  const brightMask: NodeId = g.addNode({
    type: 'utility.lumaMask',
    outputType: 'scalar',
    inputPorts: ['image'] as const,
    params: { low: opts.maskLow, high: opts.maskHigh },
  });
  g.connect(source, brightMask, 'image');

  // Mix base and neon gradient using the luma mask as blend factor
  const blended: NodeId = g.addNode({
    type: 'utility.mix',
    outputType: 'rgba',
    inputPorts: ['a', 'b', 'factor'] as const,
    params: { defaultFactor: 0.5 },
  });
  g.connect(colorBase, blended, 'a');
  g.connect(neonGrad, blended, 'b');
  g.connect(brightMask, blended, 'factor');

  // Chromatic aberration
  const output: NodeId = g.addNode({
    type: 'channel.offset',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      rOffset: opts.rOffset,
      gOffset: opts.gOffset,
      bOffset: opts.bOffset,
    },
  });
  g.connect(blended, output, 'image');

  g.setOutput(output);
  return g;
}
