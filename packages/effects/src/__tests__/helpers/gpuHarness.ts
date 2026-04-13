/**
 * GPU test harness for pixel-level shader tests.
 * Runs in a real browser context (Playwright + @vitest/browser).
 *
 * Usage:
 *   const device = await setupGPU()
 *   const plan = buildPlan(colorTransformNode({ contrast: 0 }))
 *   const pixels = await runPlan(device, plan, inputData, 2, 2)
 *   expect(pixels.get(0, 0)[0]).toBeCloseTo(0.5, 1)
 */

import { EffectGraph } from '../../graph/Graph'
import { compile, type ExecutionPlan } from '../../graph/compiler'
import { CompiledGraphPass } from '../../webgpu/CompiledGraphPass'
import type { EffectNode } from '../../nodes/types'

// ---------------------------------------------------------------------------
// Float16 encode / decode — needed because rgba16float textures require Uint16
// ---------------------------------------------------------------------------

function encodeFloat16(value: number): number {
  const buf = new ArrayBuffer(4)
  const dv = new DataView(buf)
  dv.setFloat32(0, value, true)
  const bits = dv.getUint32(0, true)

  const sign = (bits >>> 16) & 0x8000
  const exp = ((bits >>> 23) & 0xff) - 127 + 15
  const frac = bits & 0x7fffff

  if (exp <= 0) return sign // underflow → ±0
  if (exp >= 31) return sign | 0x7c00 // overflow → ±Inf

  return sign | (exp << 10) | (frac >>> 13)
}

function decodeFloat16(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1
  const exp = (bits >>> 10) & 0x1f
  const frac = bits & 0x3ff

  if (exp === 0) return sign * 2 ** -14 * (frac / 1024)
  if (exp === 31) return frac ? NaN : sign * Infinity
  return sign * 2 ** (exp - 15) * (1 + frac / 1024)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PixelResult {
  readonly width: number
  readonly height: number
  /** Returns [r, g, b, a] for the pixel at column x, row y. */
  get(x: number, y: number): [number, number, number, number]
}

/**
 * Request a WebGPU device. Throws if WebGPU is unavailable.
 * Call once per describe block and reuse the device across tests.
 */
export async function setupGPU(): Promise<GPUDevice> {
  if (!navigator.gpu) throw new Error('WebGPU not available in this browser')
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('No WebGPU adapter found')
  return adapter.requestDevice()
}

/**
 * Build an ExecutionPlan for a single effect node fed by a 'source' node.
 *
 * @param effectNode  The effect node to test.
 * @param sourcePorts Ports on the effect node that receive the source texture.
 *                    Most nodes accept ['image']; blend takes ['a', 'b'].
 */
export function buildPlan(
  effectNode: EffectNode,
  sourcePorts: string[] = ['image'],
): ExecutionPlan {
  const g = new EffectGraph()
  const srcId = g.addNode({
    type: 'source',
    outputType: 'rgba',
    inputPorts: [],
    params: {},
  })
  const effectId = g.addNode(effectNode)
  for (const port of sourcePorts) {
    g.connect(srcId, effectId, port)
  }
  g.setOutput(effectId)
  return compile(g)
}

/**
 * Run an ExecutionPlan with the given input pixel data and return the results.
 *
 * @param device     Live GPUDevice from setupGPU().
 * @param plan       Compiled plan (must start with 'source').
 * @param inputRgba  Flat RGBA Float32 array in [0, 1], row-major.
 * @param width      Texture width in pixels.
 * @param height     Texture height in pixels.
 */
export async function runPlan(
  device: GPUDevice,
  plan: ExecutionPlan,
  inputRgba: Float32Array,
  width: number,
  height: number,
): Promise<PixelResult> {
  const FORMAT = 'rgba16float' as const
  const BYTES_PER_PIXEL = 8 // 4 channels × 2 bytes

  // --- Input texture (source data) ---
  const inputTex = device.createTexture({
    size: { width, height },
    format: FORMAT,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    label: 'harness-input',
  })

  // Encode Float32 → Float16 for writeTexture
  const f16Data = new Uint16Array(width * height * 4)
  for (let i = 0; i < inputRgba.length; i++) {
    f16Data[i] = encodeFloat16(inputRgba[i])
  }
  device.queue.writeTexture(
    { texture: inputTex },
    f16Data,
    { bytesPerRow: width * BYTES_PER_PIXEL, rowsPerImage: height },
    { width, height },
  )

  // --- Output texture ---
  const outputTex = device.createTexture({
    size: { width, height },
    format: FORMAT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    label: 'harness-output',
  })

  // --- Canvas required by CompiledGraphPass.encode() for dimensions ---
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  // --- Init and encode ---
  const pass = new CompiledGraphPass(plan, 'test-pass')
  pass.setCanvas(canvas)
  pass.init(device, FORMAT)

  const encoder = device.createCommandEncoder({ label: 'harness-encoder' })
  pass.encode(encoder, inputTex.createView(), outputTex.createView())

  // --- Readback buffer (bytesPerRow must be 256-byte aligned for copyTextureToBuffer) ---
  const alignedBPR = Math.ceil((width * BYTES_PER_PIXEL) / 256) * 256
  const readbackBuffer = device.createBuffer({
    size: alignedBPR * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    label: 'harness-readback',
  })
  encoder.copyTextureToBuffer(
    { texture: outputTex },
    { buffer: readbackBuffer, bytesPerRow: alignedBPR },
    { width, height },
  )

  device.queue.submit([encoder.finish()])
  await readbackBuffer.mapAsync(GPUMapMode.READ)

  // --- Decode Uint16 (float16) → Float32 ---
  const raw = new Uint16Array(readbackBuffer.getMappedRange())
  const pixels = new Float32Array(width * height * 4)
  const u16PerRow = alignedBPR / 2 // Uint16 elements per (aligned) row

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcBase = y * u16PerRow + x * 4
      const dstBase = (y * width + x) * 4
      for (let c = 0; c < 4; c++) {
        pixels[dstBase + c] = decodeFloat16(raw[srcBase + c])
      }
    }
  }

  // --- Cleanup ---
  readbackBuffer.unmap()
  pass.dispose()
  inputTex.destroy()
  outputTex.destroy()

  return {
    width,
    height,
    get(x, y) {
      const base = (y * width + x) * 4
      return [pixels[base], pixels[base + 1], pixels[base + 2], pixels[base + 3]]
    },
  }
}

// ---------------------------------------------------------------------------
// Pixel data builders
// ---------------------------------------------------------------------------

/** Fill width×height pixels with a single RGBA color (Float32, [0,1] range). */
export function solidColor(
  r: number,
  g: number,
  b: number,
  a: number,
  width: number,
  height: number,
): Float32Array {
  const data = new Float32Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 0] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return data
}

/** Fill width×height pixels using a per-pixel callback (row-major, y=0 is top). */
export function pixelGrid(
  width: number,
  height: number,
  fn: (x: number, y: number) => [number, number, number, number],
): Float32Array {
  const data = new Float32Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fn(x, y)
      const i = (y * width + x) * 4
      data[i + 0] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return data
}
