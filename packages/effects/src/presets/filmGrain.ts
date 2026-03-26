import { EffectGraph } from '../graph/Graph';
import type { NodeId } from '../types';

export interface FilmGrainOptions {
  /** Noise frequency — higher = finer grain */
  readonly frequency: number;
  /** Grain intensity (blend strength) */
  readonly intensity: number;
  /** Noise seed */
  readonly seed: number;
}

const DEFAULTS: FilmGrainOptions = {
  frequency: 48.0,
  intensity: 0.05,
  seed: 0,
};

/**
 * Film Grain preset — high-frequency noise additively blended over the image.
 *
 * ```
 * noise(high freq) → blend(add, intensity) → output
 * ```
 */
export function createFilmGrain(options: Partial<FilmGrainOptions> = {}): EffectGraph {
  const opts: FilmGrainOptions = { ...DEFAULTS, ...options };
  const g = new EffectGraph();

  const source: NodeId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [] as const,
    params: { label: 'input' },
  });

  const noise: NodeId = g.addNode({
    type: 'noise.2d',
    outputType: 'scalar',
    inputPorts: [] as const,
    params: { frequency: opts.frequency, seed: opts.seed, noiseType: 'perlin' },
  });

  const grain: NodeId = g.addNode({
    type: 'utility.blend',
    outputType: 'rgba',
    inputPorts: ['a', 'b'] as const,
    params: { mode: 'add', intensity: opts.intensity },
  });
  g.connect(source, grain, 'a');
  g.connect(noise, grain, 'b');

  g.setOutput(grain);
  return g;
}
