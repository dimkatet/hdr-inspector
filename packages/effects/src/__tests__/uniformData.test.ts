/**
 * Tests for buildUniformData() — the pure function that serialises
 * step params into GPU-ready ArrayBuffers.
 *
 * Layout reference (from pipelines.ts comments):
 *   noise.2d       32 bytes  [freq, seed, zoom, _p, panX, panY, sampleDomain_f, _p]
 *   noise.fbm      48 bytes  [freq, seed, zoom, _p, panX, panY, persist, lacun, octaves, _p×3]
 *   geometry.warp  16 bytes  [strength, strengthY, _p, _p]
 *   geo.domainWarp 32 bytes  [freq, s1, s2, seed, persist, octaves, _p, _p]
 *   geo.blockWarp  16 bytes  [sX, sY, seed, _p]
 *   color.transform 16 bytes [brightness, contrast, saturation, hue]
 *   gradientMap   144 bytes  stops×8 (vec3+pos=16B each) + numStops u32
 *   channel.offset 32 bytes  [r.x, r.y, g.x, g.y, b.x, b.y, _p, _p]
 *   utility.mix    16 bytes  [defaultFactor, useDefault u32, _p, _p]
 *   utility.mask   16 bytes  [threshold f32, invert u32, _p, _p]
 *   utility.math   16 bytes  [op u32, clampMin, clampMax, _p]
 *   utility.blend  16 bytes  [mode u32, intensity, _p, _p]
 *   utility.lumaMask 16 bytes [low, high, _p, _p]
 *   utility.pixelate 16 bytes [blockSize, _p, _p, _p]
 *   effect.vignette 16 bytes [strength, innerRadius, outerRadius, _p]
 */
import { describe, expect, it } from 'vitest'
import type { ExecutionStep } from '../graph/compiler'
import { buildUniformData } from '../webgpu/pipelines'

function makeStep(
  type: string,
  params: Record<string, unknown>,
  inputs: Record<string, string> = {}
): ExecutionStep {
  return { id: 'test', type, params, inputs, outputType: 'rgba' }
}

function f32(buf: ArrayBuffer): Float32Array {
  return new Float32Array(buf)
}

function u32(buf: ArrayBuffer): Uint32Array {
  return new Uint32Array(buf)
}

// ---------------------------------------------------------------------------
// noise.2d — 32 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: noise.2d', () => {
  it('returns 32-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('noise.2d', { frequency: 4, seed: 0 }))
    expect(buf.byteLength).toBe(32)
  })

  it('frequency at index 0', () => {
    const buf = buildUniformData(makeStep('noise.2d', { frequency: 8.5, seed: 0 }))
    expect(f32(buf)[0]).toBeCloseTo(8.5)
  })

  it('seed at index 1', () => {
    const buf = buildUniformData(makeStep('noise.2d', { frequency: 4, seed: 42 }))
    expect(f32(buf)[1]).toBe(42)
  })

  it('zoom defaults to 1.0 at index 2', () => {
    const buf = buildUniformData(makeStep('noise.2d', { frequency: 4, seed: 0 }))
    expect(f32(buf)[2]).toBe(1.0)
  })

  it('panX/panY default to 0.0 at indices 4 and 5', () => {
    const buf = buildUniformData(makeStep('noise.2d', { frequency: 4, seed: 0 }))
    expect(f32(buf)[4]).toBe(0.0) // panX
    expect(f32(buf)[5]).toBe(0.0) // panY
  })

  it('sampleDomain "uv" → 0.0 at index 6', () => {
    const buf = buildUniformData(makeStep('noise.2d', { frequency: 4, seed: 0, sampleDomain: 'uv' }))
    expect(f32(buf)[6]).toBe(0.0)
  })

  it('sampleDomain "line" → 1.0 at index 6', () => {
    const buf = buildUniformData(makeStep('noise.2d', { frequency: 4, seed: 0, sampleDomain: 'line' }))
    expect(f32(buf)[6]).toBe(1.0)
  })

  it('sampleDomain defaults to 0.0 when absent', () => {
    const buf = buildUniformData(makeStep('noise.2d', { frequency: 4, seed: 0 }))
    expect(f32(buf)[6]).toBe(0.0)
  })
})

// ---------------------------------------------------------------------------
// noise.fbm — 48 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: noise.fbm', () => {
  it('returns 48-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('noise.fbm', { frequency: 2, seed: 0, octaves: 4, persistence: 0.5, lacunarity: 2.0 }))
    expect(buf.byteLength).toBe(48)
  })

  it('frequency at index 0', () => {
    const buf = buildUniformData(makeStep('noise.fbm', { frequency: 3.5, seed: 0, octaves: 4, persistence: 0.5, lacunarity: 2.0 }))
    expect(f32(buf)[0]).toBeCloseTo(3.5)
  })

  it('persistence at index 6, lacunarity at 7, octaves at 8', () => {
    const buf = buildUniformData(makeStep('noise.fbm', { frequency: 2, seed: 5, octaves: 6, persistence: 0.75, lacunarity: 2.5 }))
    expect(f32(buf)[6]).toBeCloseTo(0.75) // persistence
    expect(f32(buf)[7]).toBeCloseTo(2.5)  // lacunarity
    expect(f32(buf)[8]).toBeCloseTo(6)    // octaves
  })

  it('viewport layout matches noise.2d: zoom at index 2', () => {
    const buf = buildUniformData(makeStep('noise.fbm', { frequency: 2, seed: 0, octaves: 4, persistence: 0.5, lacunarity: 2.0 }))
    expect(f32(buf)[2]).toBe(1.0) // zoom default
  })
})

// ---------------------------------------------------------------------------
// geometry.warp — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: geometry.warp', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('geometry.warp', { strength: 0.1 }))
    expect(buf.byteLength).toBe(16)
  })

  it('strength at index 0', () => {
    const buf = buildUniformData(makeStep('geometry.warp', { strength: 0.15 }))
    expect(f32(buf)[0]).toBeCloseTo(0.15)
  })

  it('strengthY at index 1', () => {
    const buf = buildUniformData(makeStep('geometry.warp', { strength: 0.1, strengthY: 0.05 }))
    expect(f32(buf)[1]).toBeCloseTo(0.05)
  })

  it('strengthY defaults to 0 when absent', () => {
    const buf = buildUniformData(makeStep('geometry.warp', { strength: 0.1 }))
    expect(f32(buf)[1]).toBe(0.0)
  })
})

// ---------------------------------------------------------------------------
// color.transform — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: color.transform', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('color.transform', { brightness: 0, contrast: 1, saturation: 1, hue: 0 }))
    expect(buf.byteLength).toBe(16)
  })

  it('packs brightness, contrast, saturation, hue at indices 0–3', () => {
    const buf = buildUniformData(makeStep('color.transform', {
      brightness: 0.1, contrast: 1.2, saturation: 0.8, hue: 0.5,
    }))
    const v = f32(buf)
    expect(v[0]).toBeCloseTo(0.1)
    expect(v[1]).toBeCloseTo(1.2)
    expect(v[2]).toBeCloseTo(0.8)
    expect(v[3]).toBeCloseTo(0.5)
  })
})

// ---------------------------------------------------------------------------
// channel.offset — 32 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: channel.offset', () => {
  it('returns 32-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('channel.offset', { rOffset: [0, 0], gOffset: [0, 0], bOffset: [0, 0] }))
    expect(buf.byteLength).toBe(32)
  })

  it('packs rOffset/gOffset/bOffset at indices 0–5', () => {
    const buf = buildUniformData(makeStep('channel.offset', {
      rOffset: [0.005, 0.001],
      gOffset: [0, 0],
      bOffset: [-0.005, -0.001],
    }))
    const v = f32(buf)
    expect(v[0]).toBeCloseTo(0.005)  // rOffset.x
    expect(v[1]).toBeCloseTo(0.001)  // rOffset.y
    expect(v[2]).toBe(0)             // gOffset.x
    expect(v[3]).toBe(0)             // gOffset.y
    expect(v[4]).toBeCloseTo(-0.005) // bOffset.x
    expect(v[5]).toBeCloseTo(-0.001) // bOffset.y
  })
})

// ---------------------------------------------------------------------------
// utility.mix — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: utility.mix', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('utility.mix', { defaultFactor: 0.5 }))
    expect(buf.byteLength).toBe(16)
  })

  it('defaultFactor at f32 index 0', () => {
    const buf = buildUniformData(makeStep('utility.mix', { defaultFactor: 0.75 }))
    expect(f32(buf)[0]).toBeCloseTo(0.75)
  })

  it('useDefaultFactor is 1 when factor port is not connected', () => {
    const buf = buildUniformData(makeStep('utility.mix', { defaultFactor: 0.5 }, {}))
    expect(u32(buf)[1]).toBe(1)
  })

  it('useDefaultFactor is 0 when factor port is connected', () => {
    const buf = buildUniformData(makeStep('utility.mix', { defaultFactor: 0.5 }, { factor: 'some-step-id' }))
    expect(u32(buf)[1]).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// utility.mask — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: utility.mask', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('utility.mask', { threshold: 0.5, invert: false }))
    expect(buf.byteLength).toBe(16)
  })

  it('threshold at f32 index 0', () => {
    const buf = buildUniformData(makeStep('utility.mask', { threshold: 0.8, invert: false }))
    expect(f32(buf)[0]).toBeCloseTo(0.8)
  })

  it('invert=false → u32 index 1 = 0', () => {
    const buf = buildUniformData(makeStep('utility.mask', { threshold: 0.5, invert: false }))
    expect(u32(buf)[1]).toBe(0)
  })

  it('invert=true → u32 index 1 = 1', () => {
    const buf = buildUniformData(makeStep('utility.mask', { threshold: 0.5, invert: true }))
    expect(u32(buf)[1]).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// utility.math — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: utility.math', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('utility.math', { op: 'add' }))
    expect(buf.byteLength).toBe(16)
  })

  it.each([
    ['add', 0],
    ['subtract', 1],
    ['multiply', 2],
    ['step', 3],
    ['clamp', 4],
  ])('op "%s" → u32 index 0 = %i', (op, expected) => {
    const buf = buildUniformData(makeStep('utility.math', { op }))
    expect(u32(buf)[0]).toBe(expected)
  })

  it('clampMin/Max at f32 indices 1 and 2', () => {
    const buf = buildUniformData(makeStep('utility.math', { op: 'clamp', clampMin: 0.2, clampMax: 0.8 }))
    expect(f32(buf)[1]).toBeCloseTo(0.2)
    expect(f32(buf)[2]).toBeCloseTo(0.8)
  })
})

// ---------------------------------------------------------------------------
// utility.blend — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: utility.blend', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('utility.blend', { mode: 'add', intensity: 1.0 }))
    expect(buf.byteLength).toBe(16)
  })

  it.each([
    ['add', 0],
    ['multiply', 1],
    ['screen', 2],
    ['overlay', 3],
  ])('mode "%s" → u32 index 0 = %i', (mode, expected) => {
    const buf = buildUniformData(makeStep('utility.blend', { mode, intensity: 1.0 }))
    expect(u32(buf)[0]).toBe(expected)
  })

  it('intensity at f32 index 1', () => {
    const buf = buildUniformData(makeStep('utility.blend', { mode: 'add', intensity: 0.6 }))
    expect(f32(buf)[1]).toBeCloseTo(0.6)
  })
})

// ---------------------------------------------------------------------------
// utility.lumaMask — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: utility.lumaMask', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('utility.lumaMask', { low: 0.3, high: 0.7 }))
    expect(buf.byteLength).toBe(16)
  })

  it('low at f32 index 0, high at index 1', () => {
    const buf = buildUniformData(makeStep('utility.lumaMask', { low: 0.2, high: 0.6 }))
    expect(f32(buf)[0]).toBeCloseTo(0.2)
    expect(f32(buf)[1]).toBeCloseTo(0.6)
  })
})

// ---------------------------------------------------------------------------
// utility.pixelate — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: utility.pixelate', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('utility.pixelate', { blockSize: 16 }))
    expect(buf.byteLength).toBe(16)
  })

  it('blockSize at f32 index 0', () => {
    const buf = buildUniformData(makeStep('utility.pixelate', { blockSize: 32 }))
    expect(f32(buf)[0]).toBe(32)
  })
})

// ---------------------------------------------------------------------------
// geometry.blockWarp — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: geometry.blockWarp', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('geometry.blockWarp', { strengthX: 0.1, strengthY: 0.05, seed: 0 }))
    expect(buf.byteLength).toBe(16)
  })

  it('packs strengthX, strengthY, seed at indices 0–2', () => {
    const buf = buildUniformData(makeStep('geometry.blockWarp', { strengthX: 0.12, strengthY: 0.06, seed: 7 }))
    expect(f32(buf)[0]).toBeCloseTo(0.12)
    expect(f32(buf)[1]).toBeCloseTo(0.06)
    expect(f32(buf)[2]).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// geometry.domainWarp — 32 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: geometry.domainWarp', () => {
  it('returns 32-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('geometry.domainWarp', {
      frequency: 2, strength1: 0.04, strength2: 0.08, seed: 0, persistence: 0.5, octaves: 3,
    }))
    expect(buf.byteLength).toBe(32)
  })

  it('packs frequency, strength1, strength2, seed, persistence, octaves at indices 0–5', () => {
    const buf = buildUniformData(makeStep('geometry.domainWarp', {
      frequency: 3, strength1: 0.05, strength2: 0.1, seed: 9, persistence: 0.6, octaves: 5,
    }))
    const v = f32(buf)
    expect(v[0]).toBeCloseTo(3)
    expect(v[1]).toBeCloseTo(0.05)
    expect(v[2]).toBeCloseTo(0.1)
    expect(v[3]).toBe(9)
    expect(v[4]).toBeCloseTo(0.6)
    expect(v[5]).toBeCloseTo(5)
  })
})

// ---------------------------------------------------------------------------
// effect.vignette — 16 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: effect.vignette', () => {
  it('returns 16-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('effect.vignette', { strength: 0.8, innerRadius: 0.4, outerRadius: 1.1 }))
    expect(buf.byteLength).toBe(16)
  })

  it('packs strength, innerRadius, outerRadius at indices 0–2', () => {
    const buf = buildUniformData(makeStep('effect.vignette', { strength: 0.6, innerRadius: 0.3, outerRadius: 0.9 }))
    const v = f32(buf)
    expect(v[0]).toBeCloseTo(0.6)
    expect(v[1]).toBeCloseTo(0.3)
    expect(v[2]).toBeCloseTo(0.9)
  })
})

// ---------------------------------------------------------------------------
// color.gradientMap — 144 bytes
// ---------------------------------------------------------------------------

describe('buildUniformData: color.gradientMap', () => {
  it('returns 144-byte ArrayBuffer', () => {
    const buf = buildUniformData(makeStep('color.gradientMap', {
      stops: [{ t: 0, color: [0, 0, 0, 1] }, { t: 1, color: [1, 1, 1, 1] }],
    }))
    expect(buf.byteLength).toBe(144)
  })

  it('numStops at u32 index 32 (byte 128)', () => {
    const buf = buildUniformData(makeStep('color.gradientMap', {
      stops: [
        { t: 0, color: [0, 0, 0, 1] },
        { t: 0.5, color: [0.5, 0, 1, 1] },
        { t: 1, color: [1, 1, 1, 1] },
      ],
    }))
    expect(u32(buf)[32]).toBe(3)
  })

  it('stop colors are sorted by t and packed at stride 4 floats each', () => {
    const buf = buildUniformData(makeStep('color.gradientMap', {
      // Provide in reverse order — should be sorted ascending
      stops: [
        { t: 1,   color: [1, 0, 0, 1] }, // red
        { t: 0,   color: [0, 0, 1, 1] }, // blue
      ],
    }))
    const v = f32(buf)
    // Stop 0 (t=0, blue): color at [0, 1, 2], t at [3]
    expect(v[0]).toBeCloseTo(0) // r
    expect(v[1]).toBeCloseTo(0) // g
    expect(v[2]).toBeCloseTo(1) // b
    expect(v[3]).toBeCloseTo(0) // t

    // Stop 1 (t=1, red): color at [4, 5, 6], t at [7]
    expect(v[4]).toBeCloseTo(1) // r
    expect(v[5]).toBeCloseTo(0) // g
    expect(v[6]).toBeCloseTo(0) // b
    expect(v[7]).toBeCloseTo(1) // t
  })

  it('caps at 8 stops even if more are provided', () => {
    const buf = buildUniformData(makeStep('color.gradientMap', {
      stops: Array.from({ length: 12 }, (_, i) => ({
        t: i / 11,
        color: [i / 11, 0, 0, 1] as [number, number, number, number],
      })),
    }))
    expect(u32(buf)[32]).toBe(8)
  })

  it('empty stops array → numStops = 0', () => {
    const buf = buildUniformData(makeStep('color.gradientMap', { stops: [] }))
    expect(u32(buf)[32]).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Unknown node type
// ---------------------------------------------------------------------------

describe('buildUniformData: error handling', () => {
  it('throws for unknown node types', () => {
    expect(() =>
      buildUniformData(makeStep('does.not.exist', {}))
    ).toThrow()
  })
})
