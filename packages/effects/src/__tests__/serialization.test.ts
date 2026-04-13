import { describe, expect, it } from 'vitest'
import { compile } from '../graph/compiler'
import { EffectGraph } from '../graph/Graph'
import {
  createAnalogGlitch,
  createDataGlitch,
  createVignette,
} from '../index'
import {
  colorTransformNode,
  mixNode,
  pixelateNode,
  sourceNode,
  vignetteNode,
} from './helpers/nodes'

function makeComplexGraph() {
  const g = new EffectGraph()
  const src = g.addNode(sourceNode())
  const px = g.addNode(pixelateNode({ blockSize: 8 }))
  const ct = g.addNode(colorTransformNode({ brightness: 0.1, contrast: 1.3 }))
  const mix = g.addNode(mixNode({ defaultFactor: 0.7 }))
  const vig = g.addNode(vignetteNode({ strength: 0.6 }))

  g.connect(src, px, 'image')
  g.connect(src, ct, 'image')
  g.connect(px, mix, 'a')
  g.connect(ct, mix, 'b')
  g.connect(mix, vig, 'image')
  g.setOutput(vig)
  return g
}

// ---------------------------------------------------------------------------
// toJSON — format
// ---------------------------------------------------------------------------

describe('EffectGraph.toJSON()', () => {
  it('returns a plain object (no circular references)', () => {
    const g = makeComplexGraph()
    const json = g.toJSON()
    expect(() => JSON.stringify(json)).not.toThrow()
  })

  it('serialized nodes count matches getNodes().size', () => {
    const g = makeComplexGraph()
    const json = g.toJSON()
    expect(json.nodes).toHaveLength(g.getNodes().size)
  })

  it('serialized connections count matches getConnections().length', () => {
    const g = makeComplexGraph()
    const json = g.toJSON()
    expect(json.connections).toHaveLength(g.getConnections().length)
  })

  it('serialized outputId matches getOutputId()', () => {
    const g = makeComplexGraph()
    const json = g.toJSON()
    expect(json.outputId).toBe(g.getOutputId())
  })

  it('node params are preserved in serialized form', () => {
    const g = makeComplexGraph()
    const json = g.toJSON()
    const vigSer = json.nodes.find((n) => n.type === 'effect.vignette')!
    expect(vigSer.params.strength).toBe(0.6)
  })
})

// ---------------------------------------------------------------------------
// fromJSON — round-trip
// ---------------------------------------------------------------------------

describe('EffectGraph.fromJSON() round-trip', () => {
  it('reconstructed graph has the same node count', () => {
    const g = makeComplexGraph()
    const g2 = EffectGraph.fromJSON(g.toJSON())
    expect(g2.getNodes().size).toBe(g.getNodes().size)
  })

  it('reconstructed graph has the same connection count', () => {
    const g = makeComplexGraph()
    const g2 = EffectGraph.fromJSON(g.toJSON())
    expect(g2.getConnections().length).toBe(g.getConnections().length)
  })

  it('reconstructed graph outputId is preserved', () => {
    const g = makeComplexGraph()
    const g2 = EffectGraph.fromJSON(g.toJSON())
    expect(g2.getOutputId()).toBe(g.getOutputId())
  })

  it('reconstructed graph is valid', () => {
    const g = makeComplexGraph()
    const g2 = EffectGraph.fromJSON(g.toJSON())
    expect(g2.validate().valid).toBe(true)
  })

  it('node types are preserved after round-trip', () => {
    const g = makeComplexGraph()
    const g2 = EffectGraph.fromJSON(g.toJSON())

    const types1 = [...g.getNodes().values()].map((n) => n.type).sort()
    const types2 = [...g2.getNodes().values()].map((n) => n.type).sort()
    expect(types2).toEqual(types1)
  })

  it('node params are preserved after round-trip', () => {
    const g = makeComplexGraph()
    const g2 = EffectGraph.fromJSON(g.toJSON())

    const vig2 = [...g2.getNodes().values()].find((n) => n.type === 'effect.vignette')!
    expect((vig2.params as { strength: number }).strength).toBe(0.6)
  })

  it('fromJSON produces an independent graph (mutating original does not affect clone)', () => {
    const g = makeComplexGraph()
    const g2 = EffectGraph.fromJSON(g.toJSON())
    const extraId = g.addNode(pixelateNode())
    void extraId
    expect(g2.getNodes().size).not.toBe(g.getNodes().size)
  })
})

// ---------------------------------------------------------------------------
// Compiled plan stability after round-trip
// ---------------------------------------------------------------------------

describe('compilation after serialization round-trip', () => {
  it('produces same step count', () => {
    const g = makeComplexGraph()
    const plan1 = compile(g)
    const plan2 = compile(EffectGraph.fromJSON(g.toJSON()))
    expect(plan2.steps.length).toBe(plan1.steps.length)
  })

  it('produces same step order (by type)', () => {
    const g = makeComplexGraph()
    const plan1 = compile(g)
    const plan2 = compile(EffectGraph.fromJSON(g.toJSON()))

    const types1 = plan1.steps.map((s) => s.type)
    const types2 = plan2.steps.map((s) => s.type)
    expect(types2).toEqual(types1)
  })
})

// ---------------------------------------------------------------------------
// Preset round-trips
// ---------------------------------------------------------------------------

describe.each([
  { name: 'analogGlitch', factory: createAnalogGlitch },
  { name: 'dataGlitch',   factory: createDataGlitch },
  { name: 'vignette',     factory: createVignette },
])('$name serialization round-trip', ({ factory }) => {
  it('compiles successfully after fromJSON(toJSON())', () => {
    const g = factory()
    const g2 = EffectGraph.fromJSON(g.toJSON())
    expect(() => compile(g2)).not.toThrow()
  })
})
