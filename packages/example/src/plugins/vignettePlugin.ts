/**
 * Vignette Post-Processing Plugin
 *
 * Demonstrates the PostProcessingPass / HDRPlugin APIs.
 * Darkens the edges of the image with a smooth radial gradient.
 */

import type {
  HDRPlugin,
  PluginContext,
  PostProcessingAPI,
  PostProcessingPass,
} from '@dimkatet/hdr-canvas';

// Minimal vertex shader (same structure as library)
const VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0,  1.0)
  );
  let pos = positions[vertexIndex];
  var out: VertexOutput;
  out.position = vec4<f32>(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + 0.5;
  out.uv.y = 1.0 - out.uv.y;
  return out;
}
`;

const FRAGMENT_SHADER = /* wgsl */ `
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let color = textureSample(inputTex, inputSampler, in.uv);
  let dist = length(in.uv - vec2<f32>(0.5, 0.5)) * 1.6;
  let vignette = 1.0 - smoothstep(0.35, 1.0, dist);
  let red = vec3<f32>(0.8, 0.6, 0.4);
  return vec4<f32>(color.rgb * vignette, color.a);
}
`;

// ============================================================
// PostProcessingPass implementation
// ============================================================

class VignettePass implements PostProcessingPass {
  readonly name = 'vignette';

  private device: GPUDevice | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private sampler: GPUSampler | null = null;

  init(device: GPUDevice, format: GPUTextureFormat): void {
    this.device = device;

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    const shader = device.createShaderModule({
      code: `${VERTEX_SHADER}\n${FRAGMENT_SHADER}`,
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      vertex: { module: shader, entryPoint: 'vs_main' },
      fragment: {
        module: shader,
        entryPoint: 'fs_main',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  encode(encoder: GPUCommandEncoder, input: GPUTextureView, output: GPUTextureView): void {
    if (!this.device || !this.pipeline || !this.bindGroupLayout || !this.sampler) return;

    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: input },
        { binding: 1, resource: this.sampler },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: output,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
  }

  dispose(): void {
    this.pipeline = null;
    this.bindGroupLayout = null;
    this.sampler = null;
    this.device = null;
  }
}

// ============================================================
// HDRPlugin wrapper
// ============================================================

export class VignettePlugin implements HDRPlugin {
  readonly name = 'vignette-plugin';

  private readonly pass = new VignettePass();
  private postProcessing: PostProcessingAPI | null = null;
  private _enabled: boolean;

  constructor(enabled = true) {
    this._enabled = enabled;
  }

  install(ctx: PluginContext): void {
    this.postProcessing = ctx.services.get('postProcessing');
    if (this._enabled) {
      this.postProcessing.addPass(this.pass);
    }
  }

  uninstall(): void {
    this.postProcessing?.removePass(this.pass.name);
    this.postProcessing = null;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(value: boolean): void {
    if (value === this._enabled) return;
    this._enabled = value;

    if (!this.postProcessing) return;
    if (value) {
      this.postProcessing.addPass(this.pass);
    } else {
      this.postProcessing.removePass(this.pass.name);
    }
  }
}
