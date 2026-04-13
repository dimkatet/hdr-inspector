import { describe, expect, it } from 'vitest'
import { compile } from '../graph/compiler'
import { EffectGraph } from '../graph/Graph'
import {
  createAnalogGlitch,
  createAnalogVHS,
  createCyberpunk,
  createDataGlitch,
  createDuotone,
  createFilmGrain,
  createLiquidGlitch,
  createNeonSignal,
  createVignette,
} from '../index'

const PRESETS = [
  { name: 'analogGlitch', factory: createAnalogGlitch },
  { name: 'analogVHS',    factory: createAnalogVHS },
  { name: 'cyberpunk',    factory: createCyberpunk },
  { name: 'dataGlitch',   factory: createDataGlitch },
  { name: 'duotone',      factory: createDuotone },
  { name: 'filmGrain',    factory: createFilmGrain },
  { name: 'liquidGlitch', factory: createLiquidGlitch },
  { name: 'neonSignal',   factory: createNeonSignal },
  { name: 'vignette',     factory: createVignette },
] as const

// ---------------------------------------------------------------------------
// Generic preset invariants
// ---------------------------------------------------------------------------

describe.each(PRESETS)('$name preset', ({ name, factory }) => {
  it('factory returns an EffectGraph instance', () => {
    const g = factory()
    expect(g).toBeInstanceOf(EffectGraph)
  })

  it('graph is valid without options override', () => {
    const result = factory().validate()
    expect(result.valid, `${name}: ${result.errors.map((e) => e.message).join(', ')}`).toBe(true)
  })

  it('graph compiles without throwing', () => {
    expect(() => compile(factory())).not.toThrow()
  })

  it('execution plan has at least 2 steps (source + at least one effect)', () => {
    const plan = compile(factory())
    expect(plan.steps.length).toBeGreaterThanOrEqual(2)
  })

  it('plan contains exactly one source step', () => {
    const plan = compile(factory())
    const sources = plan.steps.filter((s) => s.type === 'source')
    expect(sources).toHaveLength(1)
  })

  it('outputId is a valid step id', () => {
    const plan = compile(factory())
    const ids = plan.steps.map((s) => s.id)
    expect(ids).toContain(plan.outputId)
  })

  it('the output step is the last step in topological order', () => {
    const plan = compile(factory())
    const last = plan.steps[plan.steps.length - 1]
    expect(last.id).toBe(plan.outputId)
  })
})

// ---------------------------------------------------------------------------
// Preset-specific option overrides
// ---------------------------------------------------------------------------

describe('analogGlitch options', () => {
  it('accepts partial option overrides', () => {
    const g = createAnalogGlitch({ largeStrength: 0.3, highFreq: 20 })
    expect(g.validate().valid).toBe(true)
  })
})

describe('analogVHS options', () => {
  it('accepts grainIntensity override', () => {
    const g = createAnalogVHS({ grainIntensity: 0.1 })
    expect(g.validate().valid).toBe(true)
  })
})

describe('dataGlitch options', () => {
  it('accepts blockSize override', () => {
    const plan = compile(createDataGlitch({ blockSize: 32 }))
    const pixelateStep = plan.steps.find((s) => s.type === 'utility.pixelate')
    expect(pixelateStep).toBeDefined()
    expect(pixelateStep!.params.blockSize).toBe(32)
  })
})

describe('vignette options', () => {
  it('strength override is reflected in the plan', () => {
    const plan = compile(createVignette({ strength: 0.3 }))
    const vig = plan.steps.find((s) => s.type === 'effect.vignette')
    expect(vig).toBeDefined()
    expect(vig!.params.strength).toBe(0.3)
  })
})

describe('filmGrain options', () => {
  it('intensity override is reflected in the plan', () => {
    const plan = compile(createFilmGrain({ intensity: 0.15 }))
    const blend = plan.steps.find((s) => s.type === 'utility.blend')
    expect(blend).toBeDefined()
    expect(blend!.params.intensity).toBe(0.15)
  })
})

describe('neonSignal', () => {
  it('plan contains a noise node in scanline mode', () => {
    const plan = compile(createNeonSignal())
    const lineNoise = plan.steps.find(
      (s) => s.type === 'noise.2d' && s.params.sampleDomain === 'line'
    )
    expect(lineNoise).toBeDefined()
  })
})

describe('analogVHS', () => {
  it('plan contains multiple noise nodes', () => {
    const plan = compile(createAnalogVHS())
    const noiseSteps = plan.steps.filter((s) => s.type === 'noise.2d')
    expect(noiseSteps.length).toBeGreaterThanOrEqual(2)
  })

  it('at least one noise node uses scanline sample domain', () => {
    const plan = compile(createAnalogVHS())
    const lineNoise = plan.steps.find(
      (s) => s.type === 'noise.2d' && s.params.sampleDomain === 'line'
    )
    expect(lineNoise).toBeDefined()
  })
})

describe('dataGlitch', () => {
  it('plan contains pixelate, blockWarp, and channelOffset nodes', () => {
    const plan = compile(createDataGlitch())
    const types = plan.steps.map((s) => s.type)
    expect(types).toContain('utility.pixelate')
    expect(types).toContain('geometry.blockWarp')
    expect(types).toContain('channel.offset')
  })
})

describe('liquidGlitch', () => {
  it('plan uses geometry.domainWarp', () => {
    const plan = compile(createLiquidGlitch())
    const dw = plan.steps.find((s) => s.type === 'geometry.domainWarp')
    expect(dw).toBeDefined()
  })
})
