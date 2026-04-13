/**
 * Pixel-level tests for effect.vignette shader.
 *
 * Formula:
 *   dist   = distance(uv, vec2(0.5))
 *   mask   = smoothstep(innerRadius, outerRadius, dist)
 *   factor = 1 - mask * strength
 *   output = input.rgb * factor
 *
 * UV origin is the top-left corner of the canvas; center is (0.5, 0.5).
 * For an N×N canvas, pixel (x, y) has UV = ((x+0.5)/N, (y+0.5)/N).
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGPU, buildPlan, runPlan, solidColor } from '../helpers/gpuHarness'
import { vignetteNode } from '../helpers/nodes'

describe('effect.vignette pixel tests', () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupGPU()
  })

  // --- Center pixel stays bright ---

  it('center pixel of 3×3 is unaffected (dist=0 < innerRadius)', async () => {
    // 3×3 canvas: pixel (1,1) is at UV (0.5, 0.5), dist=0
    // smoothstep(0.4, 1.1, 0) = 0 → factor=1 → output = input
    const plan = buildPlan(vignetteNode({ strength: 1, innerRadius: 0.4, outerRadius: 1.1 }))
    const input = solidColor(1, 1, 1, 1, 3, 3)
    const pixels = await runPlan(device, plan, input, 3, 3)

    const [r, g, b] = pixels.get(1, 1) // center pixel
    expect(r).toBeCloseTo(1, 2)
    expect(g).toBeCloseTo(1, 2)
    expect(b).toBeCloseTo(1, 2)
  })

  // --- Corner pixels are fully darkened when dist > outerRadius ---

  it('corner pixels go black when dist > outerRadius with strength=1', async () => {
    // 3×3 canvas: corner pixel (0,0) is at UV (1/6, 1/6)
    // dist = sqrt(2*(1/6 - 0.5)^2) = sqrt(2*(1/3)^2) ≈ 0.471
    // With outerRadius=0.4 < 0.471: smoothstep = 1 → factor = 1 - 1*1 = 0 → black
    const plan = buildPlan(vignetteNode({ strength: 1, innerRadius: 0, outerRadius: 0.4 }))
    const input = solidColor(1, 1, 1, 1, 3, 3)
    const pixels = await runPlan(device, plan, input, 3, 3)

    for (const [cx, cy] of [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ] as [number, number][]) {
      const [r, g, b] = pixels.get(cx, cy)
      expect(r).toBeCloseTo(0, 2)
      expect(g).toBeCloseTo(0, 2)
      expect(b).toBeCloseTo(0, 2)
    }
  })

  // --- Center is brighter than corners on any vignette configuration ---

  it('center pixel is brighter than corners for default vignette params', async () => {
    const plan = buildPlan(vignetteNode({ strength: 0.8, innerRadius: 0.4, outerRadius: 1.1 }))
    const input = solidColor(1, 1, 1, 1, 3, 3)
    const pixels = await runPlan(device, plan, input, 3, 3)

    const [centerR] = pixels.get(1, 1)
    const [cornerR] = pixels.get(0, 0)
    expect(centerR).toBeGreaterThan(cornerR)
  })

  // --- strength=0 means no darkening ---

  it('strength=0 — vignette has no effect', async () => {
    const plan = buildPlan(vignetteNode({ strength: 0, innerRadius: 0, outerRadius: 0.5 }))
    const input = solidColor(0.7, 0.3, 0.5, 1, 3, 3)
    const pixels = await runPlan(device, plan, input, 3, 3)

    // factor = 1 - mask * 0 = 1 everywhere
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        const [r, g, b] = pixels.get(x, y)
        expect(r).toBeCloseTo(0.7, 2)
        expect(g).toBeCloseTo(0.3, 2)
        expect(b).toBeCloseTo(0.5, 2)
      }
    }
  })

  // --- Alpha is preserved ---

  it('alpha channel is not modified by vignette', async () => {
    const plan = buildPlan(vignetteNode({ strength: 1, innerRadius: 0, outerRadius: 0.4 }))
    const input = solidColor(1, 1, 1, 0.6, 3, 3)
    const pixels = await runPlan(device, plan, input, 3, 3)

    // Corner: rgb darkened but alpha unchanged
    const [, , , a] = pixels.get(0, 0)
    expect(a).toBeCloseTo(0.6, 2)
  })

  // --- Radial symmetry ---

  it('symmetrically placed pixels have equal vignette values', async () => {
    // In a 5×5 canvas the four pixels equidistant from center should match
    const plan = buildPlan(vignetteNode({ strength: 0.8, innerRadius: 0.1, outerRadius: 0.8 }))
    const input = solidColor(1, 1, 1, 1, 5, 5)
    const pixels = await runPlan(device, plan, input, 5, 5)

    // Pixels (1,2), (3,2), (2,1), (2,3) are all 1 step from center (2,2)
    const [r1] = pixels.get(1, 2)
    const [r2] = pixels.get(3, 2)
    const [r3] = pixels.get(2, 1)
    const [r4] = pixels.get(2, 3)

    expect(r1).toBeCloseTo(r2, 2)
    expect(r1).toBeCloseTo(r3, 2)
    expect(r1).toBeCloseTo(r4, 2)
  })
})
