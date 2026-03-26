import { EffectGraph } from '../graph/Graph';
import type { GradientStop, NodeId } from '../types';

export interface DuotoneOptions {
  /** Shadow color (applied at luminance = 0) */
  readonly shadowColor: readonly [number, number, number, number];
  /** Highlight color (applied at luminance = 1) */
  readonly highlightColor: readonly [number, number, number, number];
}

const DEFAULTS: DuotoneOptions = {
  shadowColor: [0.1, 0.0, 0.2, 1.0], // deep purple
  highlightColor: [1.0, 0.8, 0.2, 1.0], // warm gold
};

/**
 * Duotone preset — maps image luminance through a two-color gradient.
 *
 * ```
 * gradientMap(source, [shadowColor@0, highlightColor@1]) → output
 * ```
 */
export function createDuotone(options: Partial<DuotoneOptions> = {}): EffectGraph {
  const opts: DuotoneOptions = { ...DEFAULTS, ...options };
  const g = new EffectGraph();

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  });

  const stops: GradientStop[] = [
    { t: 0.0, color: opts.shadowColor },
    { t: 1.0, color: opts.highlightColor },
  ];

  const gradMap: NodeId = g.addNode({
    type: 'color.gradientMap',
    outputType: 'rgba',
    inputPorts: ['luminance'] as const,
    params: { stops },
  });
  g.connect(source, gradMap, 'luminance');

  g.setOutput(gradMap);
  return g;
}
