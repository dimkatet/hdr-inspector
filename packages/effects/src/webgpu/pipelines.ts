import type { ExecutionStep } from '../graph/compiler'
import {
  CHANNEL_OFFSET_SHADER,
  MASK_SHADER,
  MIX_SHADER,
  NOISE_2D_SHADER,
  WARP_SHADER,
} from './shaders'

// ---------------------------------------------------------------------------
// Port ordering per node type — determines which graph input ports map to
// texture bindings in the shader (in binding index order, starting at 2).
// Only ports listed here get texture entries in the bind group.
// ---------------------------------------------------------------------------

export const NODE_SHADER_PORTS: Record<string, readonly string[]> = {
  'noise.2d': [],
  'geometry.warp': ['image', 'field'],
  'utility.mask': ['mask'],
  'channel.offset': ['image'],
  'utility.mix': ['a', 'b', 'factor'],
}

// ---------------------------------------------------------------------------
// Pipeline creation
// ---------------------------------------------------------------------------

interface NodePipeline {
  pipeline: GPURenderPipeline
  bindGroupLayout: GPUBindGroupLayout
}

export function createNodePipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  nodeType: string,
): NodePipeline {
  switch (nodeType) {
    case 'noise.2d':     return buildPipeline(device, format, NOISE_2D_SHADER,      0)
    case 'geometry.warp':  return buildPipeline(device, format, WARP_SHADER,        2)
    case 'utility.mask':   return buildPipeline(device, format, MASK_SHADER,        1)
    case 'channel.offset': return buildPipeline(device, format, CHANNEL_OFFSET_SHADER, 1)
    case 'utility.mix':    return buildPipeline(device, format, MIX_SHADER,         3)
    default:
      throw new Error(`[effects-graph/webgpu] No pipeline for node type "${nodeType}"`)
  }
}

/**
 * Builds a render pipeline with:
 * - binding 0: uniform buffer
 * - binding 1: sampler (if textureCount > 0)
 * - bindings 2..N: float textures
 */
function buildPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  shaderCode: string,
  textureCount: number,
): NodePipeline {
  const entries: GPUBindGroupLayoutEntry[] = [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
  ]

  if (textureCount > 0) {
    entries.push({
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    })
    for (let i = 0; i < textureCount; i++) {
      entries.push({
        binding: 2 + i,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      })
    }
  }

  const bindGroupLayout = device.createBindGroupLayout({ entries })

  const shader = device.createShaderModule({ code: shaderCode })
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module: shader, entryPoint: 'vs_main' },
    fragment: {
      module: shader,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-strip' },
  })

  return { pipeline, bindGroupLayout }
}

// ---------------------------------------------------------------------------
// Uniform buffer creation — one per step, written once from step.params
// ---------------------------------------------------------------------------

export function createUniformBuffer(device: GPUDevice, step: ExecutionStep): GPUBuffer {
  const data = buildUniformData(step)
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: `uniform-${step.id}`,
  })
  device.queue.writeBuffer(buffer, 0, data)
  return buffer
}

export function buildUniformData(step: ExecutionStep): ArrayBuffer {
  const p = step.params

  switch (step.type) {
    case 'noise.2d': {
      // { frequency: f32, seed: f32, zoom: f32, _pad0: f32, panX: f32, panY: f32, _pad1: f32, _pad2: f32 } = 32 bytes
      // zoom/panX/panY are viewport params updated at runtime via setViewportTransform()
      const buf = new Float32Array(8)
      buf[0] = (p.frequency as number) ?? 4.0
      buf[1] = (p.seed as number) ?? 0.0
      buf[2] = 1.0  // zoom default
      buf[3] = 0.0  // _pad0
      buf[4] = 0.0  // panX default
      buf[5] = 0.0  // panY default
      return buf.buffer
    }
    case 'geometry.warp': {
      // { strength: f32, _pad×3 } = 16 bytes
      const buf = new Float32Array(4)
      buf[0] = (p.strength as number) ?? 0.05
      return buf.buffer
    }
    case 'utility.mask': {
      // { threshold: f32, invert: u32, _pad×2 } = 16 bytes
      const buf = new ArrayBuffer(16)
      new Float32Array(buf)[0] = (p.threshold as number) ?? 0.5
      new Uint32Array(buf)[1] = (p.invert as boolean) ? 1 : 0
      return buf
    }
    case 'channel.offset': {
      // { rOffset: vec2f, gOffset: vec2f, bOffset: vec2f, _pad: vec2f } = 32 bytes
      const buf = new Float32Array(8)
      const ro = (p.rOffset as [number, number]) ?? [0, 0]
      const go = (p.gOffset as [number, number]) ?? [0, 0]
      const bo = (p.bOffset as [number, number]) ?? [0, 0]
      buf[0] = ro[0]; buf[1] = ro[1]
      buf[2] = go[0]; buf[3] = go[1]
      buf[4] = bo[0]; buf[5] = bo[1]
      return buf.buffer
    }
    case 'utility.mix': {
      // { defaultFactor: f32, useDefaultFactor: u32, _pad×2 } = 16 bytes
      const hasFactorInput = 'factor' in step.inputs
      const buf = new ArrayBuffer(16)
      new Float32Array(buf)[0] = (p.defaultFactor as number) ?? 0.5
      new Uint32Array(buf)[1] = hasFactorInput ? 0 : 1
      return buf
    }
    default:
      throw new Error(`[effects-graph/webgpu] No uniform layout for node type "${step.type}"`)
  }
}
