import { EffectGraph } from '../graph/Graph';
import type { NodeId } from '../types';

export interface VignetteOptions {
  /** Darkening intensity in [0, 1] */
  readonly strength: number;
  /** Radius at which darkening starts (UV distance from center) */
  readonly innerRadius: number;
  /** Radius at which darkening reaches full strength */
  readonly outerRadius: number;
}

const DEFAULTS: VignetteOptions = {
  strength: 0.8,
  innerRadius: 0.4,
  outerRadius: 0.9,
};

/**
 * Vignette preset — radial darkening around the image edges.
 *
 * ```
 * vignette(source, strength, innerRadius, outerRadius) → output
 * ```
 */
export function createVignette(options: Partial<VignetteOptions> = {}): EffectGraph {
  const opts: VignetteOptions = { ...DEFAULTS, ...options };
  const g = new EffectGraph();

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  });

  const vignette: NodeId = g.addNode({
    type: 'effect.vignette',
    outputType: 'rgba',
    inputPorts: ['image'] as const,
    params: {
      strength: opts.strength,
      innerRadius: opts.innerRadius,
      outerRadius: opts.outerRadius,
    },
  });
  g.connect(source, vignette, 'image');

  g.setOutput(vignette);
  return g;
}
