/**
 * Pixel-level tests for utility shaders: lumaMask and blend.
 *
 * lumaMask formula:
 *   luma = dot(rgb, [0.2126, 0.7152, 0.0722])
 *   mask = smoothstep(low, high, luma)
 *   output = vec4(mask, mask, mask, 1)
 *
 * blend add formula (mode=0):
 *   f = fieldTex.r * intensity
 *   output.rgb = imageTex.rgb + f
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGPU, buildPlan, runPlan, solidColor } from '../helpers/gpuHarness'
import { blendNode, lumaMaskNode } from '../helpers/nodes'

// smoothstep(low, high, x): t = clamp((x-low)/(high-low)); t*t*(3-2*t)
function smoothstep(low: number, high: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

describe('utility.lumaMask pixel tests', () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupGPU()
  })

  it('black input → mask=0 (output black)', async () => {
    const plan = buildPlan(lumaMaskNode({ low: 0, high: 1 }))
    const input = solidColor(0, 0, 0, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    // luma=0, smoothstep(0,1,0)=0 → output=(0,0,0,1)
    const [r, g, b, a] = pixels.get(0, 0)
    expect(r).toBeCloseTo(0, 2)
    expect(g).toBeCloseTo(0, 2)
    expect(b).toBeCloseTo(0, 2)
    expect(a).toBeCloseTo(1, 2)
  })

  it('white input → mask=1 (output white)', async () => {
    const plan = buildPlan(lumaMaskNode({ low: 0, high: 1 }))
    const input = solidColor(1, 1, 1, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    // luma=1, smoothstep(0,1,1)=1 → output=(1,1,1,1)
    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(1, 2)
    expect(g).toBeCloseTo(1, 2)
    expect(b).toBeCloseTo(1, 2)
  })

  it('mid-gray input → smoothstep result', async () => {
    const plan = buildPlan(lumaMaskNode({ low: 0, high: 1 }))
    const input = solidColor(0.5, 0.5, 0.5, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    // luma = dot([0.5,0.5,0.5], BT.709) = 0.5
    // smoothstep(0, 1, 0.5) = 0.5*0.5*(3-2*0.5) = 0.25*2 = 0.5
    const expected = smoothstep(0, 1, 0.5) // = 0.5
    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(expected, 2)
    expect(g).toBeCloseTo(expected, 2)
    expect(b).toBeCloseTo(expected, 2)
  })

  it('luma below low threshold → mask=0', async () => {
    // Red luma = 0.2126; threshold range [0.5, 1] → luma < low → mask=0
    const plan = buildPlan(lumaMaskNode({ low: 0.5, high: 1 }))
    const input = solidColor(1, 0, 0, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(0, 2)
    expect(g).toBeCloseTo(0, 2)
    expect(b).toBeCloseTo(0, 2)
  })

  it('luma above high threshold → mask=1', async () => {
    // White luma = 1.0; threshold range [0, 0.5] → luma > high → mask=1
    const plan = buildPlan(lumaMaskNode({ low: 0, high: 0.5 }))
    const input = solidColor(1, 1, 1, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(1, 2)
    expect(g).toBeCloseTo(1, 2)
    expect(b).toBeCloseTo(1, 2)
  })

  it('output alpha is always 1 regardless of input alpha', async () => {
    const plan = buildPlan(lumaMaskNode({ low: 0, high: 1 }))
    const input = solidColor(0.5, 0.5, 0.5, 0.3, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    // Shader returns vec4f(mask, mask, mask, 1.0) — hardcoded alpha 1
    const [, , , a] = pixels.get(0, 0)
    expect(a).toBeCloseTo(1, 2)
  })

  it('output is grayscale (r=g=b) even for chromatic input', async () => {
    const plan = buildPlan(lumaMaskNode({ low: 0, high: 1 }))
    const input = solidColor(0.8, 0.2, 0.5, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    // The mask is applied equally to all channels
    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(g, 2)
    expect(g).toBeCloseTo(b, 2)
  })
})

describe('utility.blend pixel tests (add mode)', () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupGPU()
  })

  it('add mode: output.rgb = image.rgb + field.r * intensity', async () => {
    // Both 'a' and 'b' ports receive the same source texture.
    // With mode=add, intensity=1: f = source.r * 1; output = source.rgb + f
    // For gray (0.2, 0.2, 0.2, 1): f = 0.2; output = (0.4, 0.4, 0.4)
    const plan = buildPlan(blendNode({ mode: 'add', intensity: 1.0 }), ['a', 'b'])
    const input = solidColor(0.2, 0.2, 0.2, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(0.4, 2)
    expect(g).toBeCloseTo(0.4, 2)
    expect(b).toBeCloseTo(0.4, 2)
  })

  it('add mode with intensity=0: no change (f=0)', async () => {
    // f = source.r * 0 = 0; output = source.rgb + 0 = source.rgb
    const plan = buildPlan(blendNode({ mode: 'add', intensity: 0 }), ['a', 'b'])
    const input = solidColor(0.6, 0.3, 0.1, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(0.6, 2)
    expect(g).toBeCloseTo(0.3, 2)
    expect(b).toBeCloseTo(0.1, 2)
  })

  it('add mode: alpha from image is preserved', async () => {
    const plan = buildPlan(blendNode({ mode: 'add', intensity: 1.0 }), ['a', 'b'])
    const input = solidColor(0.1, 0.1, 0.1, 0.8, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    // Shader: return vec4f(rgb, img.a) — alpha from imageTex (port 'a')
    const [, , , a] = pixels.get(0, 0)
    expect(a).toBeCloseTo(0.8, 2)
  })
})
