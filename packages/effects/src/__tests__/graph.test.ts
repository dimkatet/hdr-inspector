import { describe, expect, it } from 'vitest'
import { EffectGraph } from '../graph/Graph'
import {
  colorTransformNode,
  lumaMaskNode,
  mixNode,
  noise2dNode,
  pixelateNode,
  sourceNode,
  vignetteNode,
  warpNode,
} from './helpers/nodes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSimpleGraph() {
  const g = new EffectGraph()
  const src = g.addNode(sourceNode())
  const vig = g.addNode(vignetteNode())
  g.connect(src, vig, 'image')
  g.setOutput(vig)
  return { g, src, vig }
}

// ---------------------------------------------------------------------------
// addNode / getNodes
// ---------------------------------------------------------------------------

describe('EffectGraph.addNode', () => {
  it('returns a string id', () => {
    const g = new EffectGraph()
    const id = g.addNode(sourceNode())
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('makes the node available via getNodes()', () => {
    const g = new EffectGraph()
    const id = g.addNode(sourceNode())
    expect(g.getNodes().has(id)).toBe(true)
    expect(g.getNodes().get(id)!.type).toBe('source')
  })

  it('assigns unique ids for each node', () => {
    const g = new EffectGraph()
    const a = g.addNode(sourceNode())
    const b = g.addNode(noise2dNode())
    expect(a).not.toBe(b)
  })
})

// ---------------------------------------------------------------------------
// connect / getConnections
// ---------------------------------------------------------------------------

describe('EffectGraph.connect', () => {
  it('adds a connection', () => {
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const vig = g.addNode(vignetteNode())
    g.connect(src, vig, 'image')

    const conns = g.getConnections()
    expect(conns).toHaveLength(1)
    expect(conns[0].fromNode).toBe(src)
    expect(conns[0].toNode).toBe(vig)
    expect(conns[0].toPort).toBe('image')
  })

  it('connecting to the same port replaces the previous connection', () => {
    const g = new EffectGraph()
    const src1 = g.addNode(sourceNode())
    const src2 = g.addNode(noise2dNode())
    const vig = g.addNode(vignetteNode())

    g.connect(src1, vig, 'image')
    g.connect(src2, vig, 'image')

    const conns = g.getConnections()
    const imageConns = conns.filter((c) => c.toNode === vig && c.toPort === 'image')
    expect(imageConns).toHaveLength(1)
    expect(imageConns[0].fromNode).toBe(src2)
  })

  it('multiple connections to different ports coexist', () => {
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const noise = g.addNode(noise2dNode())
    const warp = g.addNode(warpNode())

    g.connect(src, warp, 'image')
    g.connect(noise, warp, 'field')

    expect(g.getConnections()).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// setOutput / getOutputId
// ---------------------------------------------------------------------------

describe('EffectGraph.setOutput', () => {
  it('getOutputId() returns null before setOutput()', () => {
    const g = new EffectGraph()
    expect(g.getOutputId()).toBeNull()
  })

  it('getOutputId() returns the set node id', () => {
    const g = new EffectGraph()
    const id = g.addNode(sourceNode())
    g.setOutput(id)
    expect(g.getOutputId()).toBe(id)
  })

  it('setOutput() can be reassigned', () => {
    const g = new EffectGraph()
    const a = g.addNode(sourceNode())
    const b = g.addNode(vignetteNode())
    g.setOutput(a)
    g.setOutput(b)
    expect(g.getOutputId()).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// removeNode
// ---------------------------------------------------------------------------

describe('EffectGraph.removeNode', () => {
  it('removed node is no longer in getNodes()', () => {
    const { g, src } = makeSimpleGraph()
    g.removeNode(src)
    expect(g.getNodes().has(src)).toBe(false)
  })

  it('removes all connections that reference the deleted node', () => {
    const { g, src } = makeSimpleGraph()
    expect(g.getConnections().length).toBeGreaterThan(0)
    g.removeNode(src)
    const remaining = g.getConnections().filter(
      (c) => c.fromNode === src || c.toNode === src
    )
    expect(remaining).toHaveLength(0)
  })

  it('clears the output when the output node is removed', () => {
    const { g, vig } = makeSimpleGraph()
    g.removeNode(vig)
    expect(g.getOutputId()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe('EffectGraph.validate', () => {
  it('valid graph → valid: true with no errors', () => {
    const { g } = makeSimpleGraph()
    const result = g.validate()
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('empty graph → no-output error', () => {
    const g = new EffectGraph()
    const result = g.validate()
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.kind === 'no-output')).toBe(true)
  })

  it('missing required port → missing-required-input error', () => {
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const vig = g.addNode(vignetteNode())
    // Connect nothing to vignette's 'image' port
    g.setOutput(vig)

    const result = g.validate()
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.kind === 'missing-required-input')).toBe(true)

    // src added but not connected — validate only, just checking error presence
    void src
  })

  it('cycle → cycle error', () => {
    // Build a graph where two nodes reference each other.
    // We have to manually build an invalid state since the API prevents normal cycles.
    // Approach: add nodes, then manually check the validate method detects them.
    // Because EffectGraph.connect() would allow it (no cycle check on connect),
    // we can create src→A→B and B→A to form a cycle.
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const px = g.addNode(pixelateNode())
    const ct = g.addNode(colorTransformNode())

    // px takes src as image — fine
    g.connect(src, px, 'image')
    // ct takes px as image — fine
    g.connect(px, ct, 'image')
    // Close the cycle: px's "image" now comes from ct (overrides src connection)
    g.connect(ct, px, 'image')
    g.setOutput(ct)

    const result = g.validate()
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.kind === 'cycle')).toBe(true)
  })

  it('optional port unconnected is valid (utility.mix factor port)', () => {
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const px = g.addNode(pixelateNode())
    const ct = g.addNode(colorTransformNode())
    const mix = g.addNode(mixNode())

    g.connect(src, px, 'image')
    g.connect(src, ct, 'image')
    g.connect(px, mix, 'a')
    g.connect(ct, mix, 'b')
    // 'factor' port intentionally left unconnected
    g.setOutput(mix)

    const result = g.validate()
    expect(result.valid).toBe(true)
  })

  it('lumaMask feeding into mix factor port is valid', () => {
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const px = g.addNode(pixelateNode())
    const ct = g.addNode(colorTransformNode())
    const luma = g.addNode(lumaMaskNode())
    const mix = g.addNode(mixNode())

    g.connect(src, px, 'image')
    g.connect(src, ct, 'image')
    g.connect(src, luma, 'image')
    g.connect(px, mix, 'a')
    g.connect(ct, mix, 'b')
    g.connect(luma, mix, 'factor')
    g.setOutput(mix)

    expect(g.validate().valid).toBe(true)
  })
})
