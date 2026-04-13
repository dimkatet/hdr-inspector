import { describe, expect, it } from 'vitest'
import { CompileError, compile } from '../graph/compiler'
import { EffectGraph } from '../graph/Graph'
import {
  colorTransformNode,
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

function makeLinearGraph() {
  // source → pixelate → vignette
  const g = new EffectGraph()
  const src = g.addNode(sourceNode())
  const px = g.addNode(pixelateNode())
  const vig = g.addNode(vignetteNode())
  g.connect(src, px, 'image')
  g.connect(px, vig, 'image')
  g.setOutput(vig)
  return { g, src, px, vig }
}

// ---------------------------------------------------------------------------
// Basic compilation
// ---------------------------------------------------------------------------

describe('compile()', () => {
  it('returns a plan with one step per node', () => {
    const { g } = makeLinearGraph()
    const plan = compile(g)
    expect(plan.steps).toHaveLength(3)
  })

  it('outputId points to the graph output node', () => {
    const { g, vig } = makeLinearGraph()
    const plan = compile(g)
    expect(plan.outputId).toBe(vig)
  })

  it('each step carries the correct type and params', () => {
    const { g, px } = makeLinearGraph()
    const plan = compile(g)
    const pxStep = plan.steps.find((s) => s.id === px)!
    expect(pxStep.type).toBe('utility.pixelate')
    expect(pxStep.params.blockSize).toBe(16)
  })

  it('step.inputs maps port names to source step ids', () => {
    const { g, src, px, vig } = makeLinearGraph()
    const plan = compile(g)
    const pxStep = plan.steps.find((s) => s.id === px)!
    const vigStep = plan.steps.find((s) => s.id === vig)!
    expect(pxStep.inputs['image']).toBe(src)
    expect(vigStep.inputs['image']).toBe(px)
  })

  it('source step has no inputs', () => {
    const { g, src } = makeLinearGraph()
    const plan = compile(g)
    const srcStep = plan.steps.find((s) => s.id === src)!
    expect(Object.keys(srcStep.inputs)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Topological ordering
// ---------------------------------------------------------------------------

describe('topological ordering', () => {
  it('dependencies appear before their dependents', () => {
    const { g, src, px, vig } = makeLinearGraph()
    const plan = compile(g)
    const ids = plan.steps.map((s) => s.id)
    expect(ids.indexOf(src)).toBeLessThan(ids.indexOf(px))
    expect(ids.indexOf(px)).toBeLessThan(ids.indexOf(vig))
  })

  it('diamond dependency: A→B, A→C, B+C→D', () => {
    // A (source) → B (pixelate) → D (mix.a)
    // A (source) → C (colorTransform) → D (mix.b)
    const g = new EffectGraph()
    const srcId = g.addNode(sourceNode())
    const bId = g.addNode(pixelateNode())
    const cId = g.addNode(colorTransformNode())
    const dId = g.addNode(mixNode())

    g.connect(srcId, bId, 'image')
    g.connect(srcId, cId, 'image')
    g.connect(bId, dId, 'a')
    g.connect(cId, dId, 'b')
    g.setOutput(dId)

    const plan = compile(g)
    const ids = plan.steps.map((s) => s.id)

    expect(ids.indexOf(srcId)).toBeLessThan(ids.indexOf(bId))
    expect(ids.indexOf(srcId)).toBeLessThan(ids.indexOf(cId))
    expect(ids.indexOf(bId)).toBeLessThan(ids.indexOf(dId))
    expect(ids.indexOf(cId)).toBeLessThan(ids.indexOf(dId))
  })

  it('multi-input warp node: source appears before warp, noise before warp', () => {
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const noise = g.addNode(noise2dNode())
    const warp = g.addNode(warpNode())

    g.connect(src, warp, 'image')
    g.connect(noise, warp, 'field')
    g.setOutput(warp)

    const plan = compile(g)
    const ids = plan.steps.map((s) => s.id)
    expect(ids.indexOf(src)).toBeLessThan(ids.indexOf(warp))
    expect(ids.indexOf(noise)).toBeLessThan(ids.indexOf(warp))
  })
})

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('compile() errors', () => {
  it('throws CompileError when graph has no output', () => {
    const g = new EffectGraph()
    g.addNode(sourceNode())
    expect(() => compile(g)).toThrow(CompileError)
  })

  it('throws CompileError when a required port is unconnected', () => {
    const g = new EffectGraph()
    const vig = g.addNode(vignetteNode())
    g.setOutput(vig)
    expect(() => compile(g)).toThrow(CompileError)
  })

  it('throws CompileError when the graph has a cycle', () => {
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const px = g.addNode(pixelateNode())
    const ct = g.addNode(colorTransformNode())

    g.connect(src, px, 'image')
    g.connect(px, ct, 'image')
    g.connect(ct, px, 'image') // cycle: ct → px → ct
    g.setOutput(ct)

    expect(() => compile(g)).toThrow(CompileError)
  })

  it('CompileError message is descriptive', () => {
    const g = new EffectGraph()
    try {
      compile(g)
    } catch (e) {
      expect(e).toBeInstanceOf(CompileError)
      expect((e as Error).message).toContain('EffectGraph compiler')
    }
  })
})

// ---------------------------------------------------------------------------
// Optional ports
// ---------------------------------------------------------------------------

describe('optional ports in compiled plan', () => {
  it('unconnected optional port (mix.factor) is absent from step.inputs', () => {
    const g = new EffectGraph()
    const src = g.addNode(sourceNode())
    const px = g.addNode(pixelateNode())
    const ct = g.addNode(colorTransformNode())
    const mix = g.addNode(mixNode())

    g.connect(src, px, 'image')
    g.connect(src, ct, 'image')
    g.connect(px, mix, 'a')
    g.connect(ct, mix, 'b')
    g.setOutput(mix)

    const plan = compile(g)
    const mixStep = plan.steps.find((s) => s.id === mix)!
    expect('factor' in mixStep.inputs).toBe(false)
    expect(mixStep.inputs['a']).toBe(px)
    expect(mixStep.inputs['b']).toBe(ct)
  })
})
