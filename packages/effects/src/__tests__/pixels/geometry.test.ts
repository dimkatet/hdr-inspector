/**
 * Pixel-level tests for geometry/utility shaders that involve UV remapping.
 *
 * utility.pixelate formula:
 *   blockUV = (floor(uv * blockSize) + 0.5) / blockSize
 *   output  = textureSample(imageTex, samp, blockUV)
 *
 * blockSize = number of blocks per dimension (not pixel width of a block).
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGPU, buildPlan, runPlan, pixelGrid } from '../helpers/gpuHarness'
import { pixelateNode } from '../helpers/nodes'

describe('utility.pixelate pixel tests', () => {
  let device: GPUDevice

  beforeAll(async () => {
    device = await setupGPU()
  })

  /**
   * 4×4 texture with two horizontal bands (blockSize=2 → 2 blocks per dimension):
   *   Rows 0,1 → red   (1, 0, 0, 1)
   *   Rows 2,3 → blue  (0, 0, 1, 1)
   *
   * After pixelation with blockSize=2:
   *   - Rows 0 and 1 both snap to blockUV.y = 0.25 → bilinear between rows 0 (red) and 1 (red) = red
   *   - Rows 2 and 3 both snap to blockUV.y = 0.75 → bilinear between rows 2 (blue) and 3 (blue) = blue
   *
   * The key property: pixels within the same block are all identical.
   */

  it('all pixels in the top block are red', async () => {
    const plan = buildPlan(pixelateNode({ blockSize: 2 }))
    const input = pixelGrid(4, 4, (_x, y) => (y < 2 ? [1, 0, 0, 1] : [0, 0, 1, 1]))
    const pixels = await runPlan(device, plan, input, 4, 4)

    // Rows 0 and 1 should all be red
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        const [r, g, b] = pixels.get(x, y)
        expect(r).toBeCloseTo(1, 2)
        expect(g).toBeCloseTo(0, 2)
        expect(b).toBeCloseTo(0, 2)
      }
    }
  })

  it('all pixels in the bottom block are blue', async () => {
    const plan = buildPlan(pixelateNode({ blockSize: 2 }))
    const input = pixelGrid(4, 4, (_x, y) => (y < 2 ? [1, 0, 0, 1] : [0, 0, 1, 1]))
    const pixels = await runPlan(device, plan, input, 4, 4)

    // Rows 2 and 3 should all be blue
    for (let y = 2; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const [r, g, b] = pixels.get(x, y)
        expect(r).toBeCloseTo(0, 2)
        expect(g).toBeCloseTo(0, 2)
        expect(b).toBeCloseTo(1, 2)
      }
    }
  })

  it('pixels within each 2×2 block are all identical', async () => {
    // Vertical stripes: left half red, right half green
    const plan = buildPlan(pixelateNode({ blockSize: 2 }))
    const input = pixelGrid(4, 4, (x, _y) => (x < 2 ? [1, 0, 0, 1] : [0, 1, 0, 1]))
    const pixels = await runPlan(device, plan, input, 4, 4)

    // For each block, verify all 4 pixels are equal
    for (const [bx, by] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as [number, number][]) {
      // 2×2 block starting at (bx*2, by*2)
      const [r00, g00, b00] = pixels.get(bx * 2 + 0, by * 2 + 0)
      const [r10, g10, b10] = pixels.get(bx * 2 + 1, by * 2 + 0)
      const [r01, g01, b01] = pixels.get(bx * 2 + 0, by * 2 + 1)
      const [r11, g11, b11] = pixels.get(bx * 2 + 1, by * 2 + 1)

      expect(r10).toBeCloseTo(r00, 2)
      expect(r01).toBeCloseTo(r00, 2)
      expect(r11).toBeCloseTo(r00, 2)

      expect(g10).toBeCloseTo(g00, 2)
      expect(g01).toBeCloseTo(g00, 2)
      expect(g11).toBeCloseTo(g00, 2)

      expect(b10).toBeCloseTo(b00, 2)
      expect(b01).toBeCloseTo(b00, 2)
      expect(b11).toBeCloseTo(b00, 2)
    }
  })

  it('blockSize=1 (one block = entire image) — all pixels become the same color', async () => {
    // blockUV = (floor(uv * 1) + 0.5) / 1 = 0.5 for every pixel
    // Every pixel samples the very center of the image (bilinear blend of all)
    // For a checkerboard of black/white (0.5 average), output ≈ 0.5
    const plan = buildPlan(pixelateNode({ blockSize: 1 }))
    const input = pixelGrid(4, 4, (x, y) => {
      const val = (x + y) % 2 === 0 ? 0 : 1
      return [val, val, val, 1]
    })
    const pixels = await runPlan(device, plan, input, 4, 4)

    // All pixels should sample the same center point → same output
    const [r0, g0, b0] = pixels.get(0, 0)
    for (let x = 0; x < 4; x++) {
      for (let y = 0; y < 4; y++) {
        const [r, g, b] = pixels.get(x, y)
        expect(r).toBeCloseTo(r0, 2)
        expect(g).toBeCloseTo(g0, 2)
        expect(b).toBeCloseTo(b0, 2)
      }
    }
  })

  it('uniform-color input is unchanged by pixelation (any blockSize)', async () => {
    const plan = buildPlan(pixelateNode({ blockSize: 4 }))
    const input = pixelGrid(8, 8, () => [0.3, 0.6, 0.9, 1])
    const pixels = await runPlan(device, plan, input, 8, 8)

    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const [r, g, b] = pixels.get(x, y)
        expect(r).toBeCloseTo(0.3, 2)
        expect(g).toBeCloseTo(0.6, 2)
        expect(b).toBeCloseTo(0.9, 2)
      }
    }
  })
})
