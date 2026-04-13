/**
 * Pixel-level tests for color.transform shader.
 *
 * Formula (per-channel, in order):
 *   1. rgb += brightness
 *   2. rgb = (rgb - 0.5) * contrast + 0.5
 *   3. luma = dot(rgb, [0.2126, 0.7152, 0.0722])
 *      rgb = mix(luma, rgb, saturation)
 *   4. rgb = rotateHue(rgb, hue)  [not tested here]
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGPU, buildPlan, runPlan, solidColor } from '../helpers/gpuHarness'
import { colorTransformNode } from '../helpers/nodes'

describe('color.transform pixel tests', () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupGPU()
  })

  // --- Identity ---

  it('identity params — output equals input', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: 0, contrast: 1, saturation: 1, hue: 0 }),
    )
    const input = solidColor(0.4, 0.6, 0.8, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        const [r, g, b, a] = pixels.get(x, y)
        expect(r).toBeCloseTo(0.4, 2)
        expect(g).toBeCloseTo(0.6, 2)
        expect(b).toBeCloseTo(0.8, 2)
        expect(a).toBeCloseTo(1.0, 2)
      }
    }
  })

  // --- Brightness ---

  it('brightness=+0.5 on black → mid-gray', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: 0.5, contrast: 1, saturation: 1, hue: 0 }),
    )
    // Step 1: (0+0.5) = 0.5; Step 2 contrast=1: no change; Step 3 sat=1: no change
    const input = solidColor(0, 0, 0, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(0.5, 2)
    expect(g).toBeCloseTo(0.5, 2)
    expect(b).toBeCloseTo(0.5, 2)
  })

  it('brightness=-0.5 on mid-gray → black', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: -0.5, contrast: 1, saturation: 1, hue: 0 }),
    )
    // Step 1: (0.5 - 0.5) = 0; contrast=1: no change; sat=1: no change
    const input = solidColor(0.5, 0.5, 0.5, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(0, 2)
    expect(g).toBeCloseTo(0, 2)
    expect(b).toBeCloseTo(0, 2)
  })

  // --- Contrast ---

  it('contrast=0 collapses any input to uniform mid-gray (0.5)', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: 0, contrast: 0, saturation: 1, hue: 0 }),
    )
    // rgb = (rgb - 0.5) * 0 + 0.5 = 0.5 regardless of input
    const input = solidColor(1, 0, 0, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        const [r, g, b] = pixels.get(x, y)
        expect(r).toBeCloseTo(0.5, 2)
        expect(g).toBeCloseTo(0.5, 2)
        expect(b).toBeCloseTo(0.5, 2)
      }
    }
  })

  it('contrast=2 on white → 1.5 (no clamping in shader)', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: 0, contrast: 2, saturation: 1, hue: 0 }),
    )
    // Step 2: (1 - 0.5) * 2 + 0.5 = 1 + 0.5 = 1.5
    const input = solidColor(1, 1, 1, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(1.5, 2)
    expect(g).toBeCloseTo(1.5, 2)
    expect(b).toBeCloseTo(1.5, 2)
  })

  // --- Saturation ---

  it('saturation=0 on red → BT.709 luma gray (0.2126)', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: 0, contrast: 1, saturation: 0, hue: 0 }),
    )
    // luma = 0.2126*1 + 0.7152*0 + 0.0722*0 = 0.2126
    // mix(0.2126, (1,0,0), 0) = (0.2126, 0.2126, 0.2126)
    const input = solidColor(1, 0, 0, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(0.2126, 2)
    expect(g).toBeCloseTo(0.2126, 2)
    expect(b).toBeCloseTo(0.2126, 2)
  })

  it('saturation=0 on neutral gray → unchanged', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: 0, contrast: 1, saturation: 0, hue: 0 }),
    )
    // luma of (0.5,0.5,0.5) = 0.5; mix(0.5, 0.5, 0) = 0.5
    const input = solidColor(0.5, 0.5, 0.5, 1, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    const [r, g, b] = pixels.get(0, 0)
    expect(r).toBeCloseTo(0.5, 2)
    expect(g).toBeCloseTo(0.5, 2)
    expect(b).toBeCloseTo(0.5, 2)
  })

  // --- Alpha passthrough ---

  it('alpha channel is not modified by any transform', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: 0.2, contrast: 1.5, saturation: 0.5, hue: 0 }),
    )
    const input = solidColor(0.3, 0.4, 0.5, 0.75, 2, 2)
    const pixels = await runPlan(device, plan, input, 2, 2)

    // Shader returns vec4f(rgb, color.a) — alpha is untouched
    const [, , , a] = pixels.get(0, 0)
    expect(a).toBeCloseTo(0.75, 2)
  })

  // --- Larger grid: all pixels transform independently ---

  it('contrast=0 collapses all pixels in a 4x4 grid to 0.5', async () => {
    const plan = buildPlan(
      colorTransformNode({ brightness: 0, contrast: 0, saturation: 1, hue: 0 }),
    )
    // Fill with arbitrary distinct values — contrast=0 should make them all 0.5
    const input = new Float32Array(4 * 4 * 4)
    for (let i = 0; i < input.length; i++) input[i] = (i % 16) / 15
    const pixels = await runPlan(device, plan, input, 4, 4)

    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const [r, g, b] = pixels.get(x, y)
        expect(r).toBeCloseTo(0.5, 2)
        expect(g).toBeCloseTo(0.5, 2)
        expect(b).toBeCloseTo(0.5, 2)
      }
    }
  })
})
