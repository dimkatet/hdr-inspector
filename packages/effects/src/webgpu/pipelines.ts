import type { ExecutionStep } from '../graph/compiler';
import {
  BLEND_SHADER,
  BLOCK_WARP_SHADER,
  CHANNEL_OFFSET_SHADER,
  COLOR_TRANSFORM_SHADER,
  DOMAIN_WARP_SHADER,
  GRADIENT_MAP_SHADER,
  LUMA_MASK_SHADER,
  MASK_SHADER,
  MATH_SHADER,
  MIX_SHADER,
  NOISE_2D_SHADER,
  NOISE_FBM_SHADER,
  PIXELATE_SHADER,
  VIGNETTE_SHADER,
  WARP_SHADER,
} from './shaders';

// ---------------------------------------------------------------------------
// Port ordering per node type — determines which graph input ports map to
// texture bindings in the shader (in binding index order, starting at 2).
// Only ports listed here get texture entries in the bind group.
// ---------------------------------------------------------------------------

export const NODE_SHADER_PORTS: Record<string, readonly string[]> = {
  'noise.2d': [],
  'noise.fbm': [],
  'geometry.warp': ['image', 'field'],
  'geometry.domainWarp': ['image'],
  'utility.pixelate': ['image'],
  'geometry.blockWarp': ['image'],
  'color.transform': ['image'],
  'color.gradientMap': ['luminance'],
  'utility.mask': ['mask'],
  'utility.lumaMask': ['image'],
  'utility.math': ['a', 'b'],
  'channel.offset': ['image'],
  'utility.mix': ['a', 'b', 'factor'],
  'effect.vignette': ['image'],
  'utility.blend': ['a', 'b'],
};

// ---------------------------------------------------------------------------
// Pipeline creation
// ---------------------------------------------------------------------------

interface NodePipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export function createNodePipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  nodeType: string
): NodePipeline {
  switch (nodeType) {
    case 'noise.2d':
      return buildPipeline(device, format, NOISE_2D_SHADER, 0);
    case 'noise.fbm':
      return buildPipeline(device, format, NOISE_FBM_SHADER, 0);
    case 'geometry.warp':
      return buildPipeline(device, format, WARP_SHADER, 2);
    case 'color.transform':
      return buildPipeline(device, format, COLOR_TRANSFORM_SHADER, 1);
    case 'color.gradientMap':
      return buildPipeline(device, format, GRADIENT_MAP_SHADER, 1);
    case 'utility.mask':
      return buildPipeline(device, format, MASK_SHADER, 1);
    case 'utility.math':
      return buildPipeline(device, format, MATH_SHADER, 2);
    case 'channel.offset':
      return buildPipeline(device, format, CHANNEL_OFFSET_SHADER, 1);
    case 'utility.mix':
      return buildPipeline(device, format, MIX_SHADER, 3);
    case 'effect.vignette':
      return buildPipeline(device, format, VIGNETTE_SHADER, 1);
    case 'utility.blend':
      return buildPipeline(device, format, BLEND_SHADER, 2);
    case 'utility.lumaMask':
      return buildPipeline(device, format, LUMA_MASK_SHADER, 1);
    case 'geometry.domainWarp':
      return buildPipeline(device, format, DOMAIN_WARP_SHADER, 1);
    case 'utility.pixelate':
      return buildPipeline(device, format, PIXELATE_SHADER, 1);
    case 'geometry.blockWarp':
      return buildPipeline(device, format, BLOCK_WARP_SHADER, 1);
    default:
      throw new Error(`[effects-graph/webgpu] No pipeline for node type "${nodeType}"`);
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
  textureCount: number
): NodePipeline {
  const entries: GPUBindGroupLayoutEntry[] = [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
  ];

  if (textureCount > 0) {
    entries.push({
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    });
    for (let i = 0; i < textureCount; i++) {
      entries.push({
        binding: 2 + i,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      });
    }
  }

  const bindGroupLayout = device.createBindGroupLayout({ entries });

  const shader = device.createShaderModule({ code: shaderCode });
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module: shader, entryPoint: 'vs_main' },
    fragment: {
      module: shader,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-strip' },
  });

  return { pipeline, bindGroupLayout };
}

// ---------------------------------------------------------------------------
// Uniform buffer creation — one per step, written once from step.params
// ---------------------------------------------------------------------------

export function createUniformBuffer(device: GPUDevice, step: ExecutionStep): GPUBuffer {
  const data = buildUniformData(step);
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: `uniform-${step.id}`,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

export function buildUniformData(step: ExecutionStep): ArrayBuffer {
  const p = step.params;

  switch (step.type) {
    case 'noise.2d': {
      // { frequency, seed, zoom, _pad0, panX, panY, sampleDomain_f, _pad1 } = 32 bytes
      // zoom/panX/panY are viewport params updated at runtime via setViewportTransform()
      // sampleDomain_f: 0 = 'uv' (default), 1 = 'line'
      const buf = new Float32Array(8);
      buf[0] = (p.frequency as number) ?? 4.0;
      buf[1] = (p.seed as number) ?? 0.0;
      buf[2] = 1.0; // zoom default
      buf[3] = 0.0; // _pad0
      buf[4] = 0.0; // panX default
      buf[5] = 0.0; // panY default
      buf[6] = (p.sampleDomain as string) === 'line' ? 1.0 : 0.0;
      return buf.buffer;
    }
    case 'geometry.warp': {
      // { strength: f32, strengthY: f32, _pad×2 } = 16 bytes
      const buf = new Float32Array(4);
      buf[0] = (p.strength as number) ?? 0.05;
      buf[1] = (p.strengthY as number) ?? 0.0;
      return buf.buffer;
    }
    case 'utility.mask': {
      // { threshold: f32, invert: u32, _pad×2 } = 16 bytes
      const buf = new ArrayBuffer(16);
      new Float32Array(buf)[0] = (p.threshold as number) ?? 0.5;
      new Uint32Array(buf)[1] = (p.invert as boolean) ? 1 : 0;
      return buf;
    }
    case 'channel.offset': {
      // { rOffset: vec2f, gOffset: vec2f, bOffset: vec2f, _pad: vec2f } = 32 bytes
      const buf = new Float32Array(8);
      const ro = (p.rOffset as [number, number]) ?? [0, 0];
      const go = (p.gOffset as [number, number]) ?? [0, 0];
      const bo = (p.bOffset as [number, number]) ?? [0, 0];
      buf[0] = ro[0];
      buf[1] = ro[1];
      buf[2] = go[0];
      buf[3] = go[1];
      buf[4] = bo[0];
      buf[5] = bo[1];
      return buf.buffer;
    }
    case 'utility.mix': {
      // { defaultFactor: f32, useDefaultFactor: u32, _pad×2 } = 16 bytes
      const hasFactorInput = 'factor' in step.inputs;
      const buf = new ArrayBuffer(16);
      new Float32Array(buf)[0] = (p.defaultFactor as number) ?? 0.5;
      new Uint32Array(buf)[1] = hasFactorInput ? 0 : 1;
      return buf;
    }
    case 'noise.fbm': {
      // { frequency, seed, zoom, _pad0, panX, panY, persistence, lacunarity, octaves_f, _pad1-3 } = 48 bytes
      // Viewport fields (zoom at [2], panX at [4], panY at [5]) match noise.2d layout
      // so setViewportTransform() can write them with the same byte offset (8).
      const buf = new Float32Array(12);
      buf[0] = (p.frequency as number) ?? 4.0;
      buf[1] = (p.seed as number) ?? 0.0;
      buf[2] = 1.0; // zoom default
      buf[3] = 0.0; // _pad0
      buf[4] = 0.0; // panX default
      buf[5] = 0.0; // panY default
      buf[6] = (p.persistence as number) ?? 0.5;
      buf[7] = (p.lacunarity as number) ?? 2.0;
      buf[8] = (p.octaves as number) ?? 4.0;
      return buf.buffer;
    }
    case 'color.transform': {
      // { brightness, contrast, saturation, hue } = 16 bytes
      const buf = new Float32Array(4);
      buf[0] = (p.brightness as number) ?? 0.0;
      buf[1] = (p.contrast as number) ?? 1.0;
      buf[2] = (p.saturation as number) ?? 1.0;
      buf[3] = (p.hue as number) ?? 0.0;
      return buf.buffer;
    }
    case 'utility.math': {
      // { op: u32, clampMin: f32, clampMax: f32, _pad: f32 } = 16 bytes
      const opMap: Record<string, number> = { add: 0, subtract: 1, multiply: 2, step: 3, clamp: 4 };
      const buf = new ArrayBuffer(16);
      new Uint32Array(buf)[0] = opMap[(p.op as string) ?? 'add'] ?? 0;
      const f32 = new Float32Array(buf);
      f32[1] = (p.clampMin as number) ?? 0.0;
      f32[2] = (p.clampMax as number) ?? 1.0;
      return buf;
    }
    case 'color.gradientMap': {
      // stops[8] × { color: vec3f, pos: f32 } (16 bytes each) = 128 bytes
      // + { numStops: u32, _pad×3 } = 16 bytes → 144 bytes total
      const stops =
        (p.stops as Array<{ t: number; color: readonly [number, number, number, number] }>) ?? [];
      const sorted = [...stops].sort((a, b) => a.t - b.t);
      const maxStops = 8;
      const buf = new ArrayBuffer(144);
      const f32 = new Float32Array(buf);
      const u32 = new Uint32Array(buf);
      const count = Math.min(sorted.length, maxStops);
      for (let i = 0; i < count; i++) {
        const s = sorted[i];
        f32[i * 4 + 0] = s.color[0];
        f32[i * 4 + 1] = s.color[1];
        f32[i * 4 + 2] = s.color[2];
        f32[i * 4 + 3] = s.t;
      }
      u32[32] = count; // byte offset 128
      return buf;
    }
    case 'effect.vignette': {
      // { strength, innerRadius, outerRadius, _pad } = 16 bytes
      const buf = new Float32Array(4);
      buf[0] = (p.strength as number) ?? 0.8;
      buf[1] = (p.innerRadius as number) ?? 0.4;
      buf[2] = (p.outerRadius as number) ?? 0.9;
      return buf.buffer;
    }
    case 'utility.blend': {
      // { mode: u32, intensity: f32, _pad×2 } = 16 bytes
      const modeMap: Record<string, number> = { add: 0, multiply: 1, screen: 2, overlay: 3 };
      const buf = new ArrayBuffer(16);
      new Uint32Array(buf)[0] = modeMap[(p.mode as string) ?? 'add'] ?? 0;
      new Float32Array(buf)[1] = (p.intensity as number) ?? 1.0;
      return buf;
    }
    case 'utility.lumaMask': {
      // { low: f32, high: f32, _pad×2 } = 16 bytes
      const buf = new Float32Array(4);
      buf[0] = (p.low as number) ?? 0.5;
      buf[1] = (p.high as number) ?? 0.9;
      return buf.buffer;
    }
    case 'geometry.domainWarp': {
      // { frequency, strength1, strength2, seed, persistence, octaves_f, _pad×2 } = 32 bytes
      const buf = new Float32Array(8);
      buf[0] = (p.frequency as number) ?? 3.0;
      buf[1] = (p.strength1 as number) ?? 0.04;
      buf[2] = (p.strength2 as number) ?? 0.08;
      buf[3] = (p.seed as number) ?? 0.0;
      buf[4] = (p.persistence as number) ?? 0.5;
      buf[5] = (p.octaves as number) ?? 4.0;
      return buf.buffer;
    }
    case 'utility.pixelate': {
      // { blockSize: f32, _pad×3 } = 16 bytes
      const buf = new Float32Array(4);
      buf[0] = (p.blockSize as number) ?? 16.0;
      return buf.buffer;
    }
    case 'geometry.blockWarp': {
      // { strengthX, strengthY, seed, _pad } = 16 bytes
      const buf = new Float32Array(4);
      buf[0] = (p.strengthX as number) ?? 0.1;
      buf[1] = (p.strengthY as number) ?? 0.05;
      buf[2] = (p.seed as number) ?? 0.0;
      return buf.buffer;
    }
    default:
      throw new Error(`[effects-graph/webgpu] No uniform layout for node type "${step.type}"`);
  }
}
