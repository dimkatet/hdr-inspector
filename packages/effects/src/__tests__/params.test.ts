import { describe, expect, it } from 'vitest'
import type { ParamDescriptor } from '../params'
import { NODE_PARAM_SCHEMAS } from '../params'

// Node types that have a WebGPU shader implementation and a param schema.
// Note: 'color.gradientMap' has a shader but no schema yet — see the known-gaps test below.
const IMPLEMENTED_TYPES = [
  'noise.2d',
  'noise.fbm',
  'geometry.warp',
  'geometry.domainWarp',
  'geometry.blockWarp',
  'color.transform',
  'channel.offset',
  'utility.mix',
  'utility.mask',
  'utility.math',
  'utility.blend',
  'utility.lumaMask',
  'utility.pixelate',
  'effect.vignette',
] as const

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

describe('NODE_PARAM_SCHEMAS coverage', () => {
  it('has an entry for every implemented node type', () => {
    for (const type of IMPLEMENTED_TYPES) {
      expect(NODE_PARAM_SCHEMAS, `missing schema for ${type}`).toHaveProperty(type)
    }
  })

  it('every schema has at least one param', () => {
    for (const type of IMPLEMENTED_TYPES) {
      const schema = NODE_PARAM_SCHEMAS[type]
      if (!schema) continue
      expect(
        Object.keys(schema).length,
        `schema for ${type} is empty`
      ).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// ParamDescriptor shape invariants
// ---------------------------------------------------------------------------

function assertDescriptor(desc: ParamDescriptor, key: string, nodeType: string): void {
  const label = `${nodeType}.${key}`
  expect(desc.type, `${label} missing type`).toMatch(/^(number|boolean|vec2|select)$/)
  expect(desc.label, `${label} missing label`).toBeTruthy()

  switch (desc.type) {
    case 'number':
      expect(desc.min, `${label}.min must be finite`).toBeTypeOf('number')
      expect(desc.max, `${label}.max must be finite`).toBeTypeOf('number')
      expect(desc.min, `${label}: min must be <= max`).toBeLessThanOrEqual(desc.max)
      expect(desc.step, `${label}.step must be > 0`).toBeGreaterThan(0)
      expect(
        desc.default,
        `${label}: default must be >= min`
      ).toBeGreaterThanOrEqual(desc.min)
      expect(
        desc.default,
        `${label}: default must be <= max`
      ).toBeLessThanOrEqual(desc.max)
      break

    case 'boolean':
      expect(typeof desc.default).toBe('boolean')
      break

    case 'vec2':
      expect(desc.min).toBeTypeOf('number')
      expect(desc.max).toBeTypeOf('number')
      expect(desc.step).toBeGreaterThan(0)
      expect(desc.default).toHaveLength(2)
      break

    case 'select':
      expect(desc.options.length, `${label}: select needs at least one option`).toBeGreaterThan(0)
      expect(
        desc.options,
        `${label}: default must be in options`
      ).toContain(desc.default)
      break
  }
}

describe('ParamDescriptor invariants', () => {
  it('every descriptor satisfies structural constraints', () => {
    for (const [nodeType, schema] of Object.entries(NODE_PARAM_SCHEMAS)) {
      for (const [key, desc] of Object.entries(schema)) {
        assertDescriptor(desc, key, nodeType)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Spot-checks for specific nodes
// ---------------------------------------------------------------------------

describe('spot-checks', () => {
  it('noise.2d sampleDomain is a select with "uv" and "line"', () => {
    const schema = NODE_PARAM_SCHEMAS['noise.2d']!
    const sd = schema.sampleDomain
    expect(sd.type).toBe('select')
    if (sd.type === 'select') {
      expect(sd.options).toContain('uv')
      expect(sd.options).toContain('line')
    }
  })

  it('utility.math op is a select with all 5 operators', () => {
    const schema = NODE_PARAM_SCHEMAS['utility.math']!
    const op = schema.op
    expect(op.type).toBe('select')
    if (op.type === 'select') {
      for (const o of ['add', 'subtract', 'multiply', 'step', 'clamp']) {
        expect(op.options).toContain(o)
      }
    }
  })

  it('utility.blend mode is a select with all 4 modes', () => {
    const schema = NODE_PARAM_SCHEMAS['utility.blend']!
    const mode = schema.mode
    expect(mode.type).toBe('select')
    if (mode.type === 'select') {
      for (const m of ['add', 'multiply', 'screen', 'overlay']) {
        expect(mode.options).toContain(m)
      }
    }
  })

  it('effect.vignette strength default is within [0, 1]', () => {
    const schema = NODE_PARAM_SCHEMAS['effect.vignette']!
    const strength = schema.strength
    expect(strength.type).toBe('number')
    if (strength.type === 'number') {
      expect(strength.default).toBeGreaterThanOrEqual(0)
      expect(strength.default).toBeLessThanOrEqual(1)
    }
  })

  it('geometry.domainWarp has frequency, strength1, strength2, octaves, persistence, seed', () => {
    const schema = NODE_PARAM_SCHEMAS['geometry.domainWarp']!
    for (const key of ['frequency', 'strength1', 'strength2', 'octaves', 'persistence', 'seed']) {
      expect(schema, `missing param: ${key}`).toHaveProperty(key)
    }
  })
})

// ---------------------------------------------------------------------------
// Known schema gaps (shader exists but schema not yet defined)
// ---------------------------------------------------------------------------

describe('known schema gaps', () => {
  it('color.gradientMap has a shader but no param schema yet', () => {
    // Intentional: gradient stops are complex nested objects.
    // When a schema is added, move 'color.gradientMap' to IMPLEMENTED_TYPES above.
    expect(NODE_PARAM_SCHEMAS).not.toHaveProperty('color.gradientMap')
  })
})
