import { describe, expect, it } from 'vitest'
import * as shaders from '../webgpu/shaders'

const VERTEX_ONLY = 'VERTEX_SHADER'
const FRAGMENT_SHADERS = [
  'NOISE_2D_SHADER',
  'NOISE_FBM_SHADER',
  'WARP_SHADER',
  'MASK_SHADER',
  'MATH_SHADER',
  'COLOR_TRANSFORM_SHADER',
  'GRADIENT_MAP_SHADER',
  'CHANNEL_OFFSET_SHADER',
  'BLEND_SHADER',
  'LUMA_MASK_SHADER',
  'VIGNETTE_SHADER',
  'DOMAIN_WARP_SHADER',
  'PIXELATE_SHADER',
  'BLOCK_WARP_SHADER',
  'MIX_SHADER',
] as const

type ShaderKey = keyof typeof shaders

// ---------------------------------------------------------------------------
// Basic export presence
// ---------------------------------------------------------------------------

describe('shader exports', () => {
  it('VERTEX_SHADER is exported', () => {
    expect(shaders.VERTEX_SHADER).toBeDefined()
  })

  it.each(FRAGMENT_SHADERS)('%s is exported', (name) => {
    expect(shaders[name as ShaderKey]).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Non-empty strings
// ---------------------------------------------------------------------------

describe('shader string content', () => {
  it('VERTEX_SHADER is a non-empty string', () => {
    expect(typeof shaders.VERTEX_SHADER).toBe('string')
    expect(shaders.VERTEX_SHADER.length).toBeGreaterThan(0)
  })

  it.each(FRAGMENT_SHADERS)('%s is a non-empty string', (name) => {
    const code = shaders[name as ShaderKey] as string
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// WGSL structure
// ---------------------------------------------------------------------------

describe('WGSL entry points', () => {
  it('VERTEX_SHADER contains @vertex entry point', () => {
    expect(shaders.VERTEX_SHADER).toContain('@vertex')
    expect(shaders.VERTEX_SHADER).toContain('vs_main')
  })

  it.each(FRAGMENT_SHADERS)('%s contains @fragment entry point', (name) => {
    const code = shaders[name as ShaderKey] as string
    expect(code).toContain('@fragment')
    expect(code).toContain('fs_main')
  })

  it.each(FRAGMENT_SHADERS)('%s includes the vertex shader', (name) => {
    // All fragment shaders are produced as VERTEX_SHADER + FRAGMENT_SHADER
    const code = shaders[name as ShaderKey] as string
    // Both @vertex and @fragment must be present
    expect(code).toContain('@vertex')
    expect(code).toContain('@fragment')
  })
})

// ---------------------------------------------------------------------------
// Uniform struct presence
// ---------------------------------------------------------------------------

describe('uniform structs', () => {
  it('NOISE_2D_SHADER declares a struct with frequency', () => {
    expect(shaders.NOISE_2D_SHADER).toContain('frequency')
  })

  it('COLOR_TRANSFORM_SHADER declares brightness/contrast/saturation/hue', () => {
    const code = shaders.COLOR_TRANSFORM_SHADER
    expect(code).toContain('brightness')
    expect(code).toContain('contrast')
    expect(code).toContain('saturation')
    expect(code).toContain('hue')
  })

  it('GRADIENT_MAP_SHADER declares stops array', () => {
    expect(shaders.GRADIENT_MAP_SHADER).toContain('stops')
  })

  it('VIGNETTE_SHADER declares strength', () => {
    expect(shaders.VIGNETTE_SHADER).toContain('strength')
  })

  it('LUMA_MASK_SHADER references smoothstep', () => {
    expect(shaders.LUMA_MASK_SHADER).toContain('smoothstep')
  })

  it('DOMAIN_WARP_SHADER references fbm (two-pass warping)', () => {
    expect(shaders.DOMAIN_WARP_SHADER).toContain('fbm')
  })

  it('CHANNEL_OFFSET_SHADER references rOffset, gOffset, bOffset', () => {
    const code = shaders.CHANNEL_OFFSET_SHADER
    expect(code).toContain('rOffset')
    expect(code).toContain('gOffset')
    expect(code).toContain('bOffset')
  })
})
