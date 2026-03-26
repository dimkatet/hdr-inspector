/**
 * Shared fullscreen-quad vertex shader.
 * Generates 4 vertices from vertex_index; no vertex buffer needed.
 * Outputs UV with Y flipped for standard texture convention.
 */
export const VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
  var positions = array<vec2f, 4>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0,  1.0),
  );
  let pos = positions[vi];
  var out: VertexOutput;
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5);
  out.uv.y = 1.0 - out.uv.y;
  return out;
}
`

// ---------------------------------------------------------------------------
// noise.2d — 2D gradient (Perlin-style) noise
// Bindings: 0=uniform
// Output: grayscale noise in [0,1] stored in all rgba channels
// ---------------------------------------------------------------------------

const NOISE_2D_FRAGMENT = /* wgsl */ `
struct NoiseParams {
  frequency: f32,
  seed:      f32,
  // Viewport transform — updated each frame by GlitchPlugin via setViewportTransform()
  zoom:  f32,
  _pad0: f32,
  panX:  f32,
  panY:  f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: NoiseParams;

fn hash2(p: vec2f) -> vec2f {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(q) * 43758.5453123);
}

fn perlin(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2f(0.0, 0.0)), f - vec2f(0.0, 0.0)),
        dot(hash2(i + vec2f(1.0, 0.0)), f - vec2f(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2f(0.0, 1.0)), f - vec2f(0.0, 1.0)),
        dot(hash2(i + vec2f(1.0, 1.0)), f - vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Convert canvas UV → image UV so noise tracks the image on zoom/pan
  // Inverse of: canvasUV = (imageUV - 0.5) * zoom - pan + 0.5
  let imageUV = (in.uv - 0.5) / params.zoom + vec2f(params.panX, params.panY) + 0.5;
  let p = imageUV * params.frequency + vec2f(params.seed * 1.7321, params.seed * 3.1415);
  let val = perlin(p) * 0.5 + 0.5;
  return vec4f(val, val, val, 1.0);
}
`

export const NOISE_2D_SHADER = VERTEX_SHADER + NOISE_2D_FRAGMENT

// ---------------------------------------------------------------------------
// geometry.warp — horizontal scanline warp driven by a scalar field
// Bindings: 0=uniform, 1=sampler, 2=imageTex, 3=fieldTex
// ---------------------------------------------------------------------------

const WARP_FRAGMENT = /* wgsl */ `
struct WarpParams {
  strength: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: WarpParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;
@group(0) @binding(3) var fieldTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let fieldVal = textureSample(fieldTex, samp, in.uv).r;
  // remap [0,1] → [-1,1] then scale by strength for horizontal displacement
  let offset = (fieldVal * 2.0 - 1.0) * params.strength;
  let warpedUV = vec2f(in.uv.x + offset, in.uv.y);
  return textureSample(imageTex, samp, warpedUV);
}
`

export const WARP_SHADER = VERTEX_SHADER + WARP_FRAGMENT

// ---------------------------------------------------------------------------
// utility.mask — threshold step, outputs binary mask
// Bindings: 0=uniform, 1=sampler, 2=maskTex
// Note: 'image' graph port is not needed in the shader (mask feeds mix.factor)
// Output: step(threshold, mask.r) in all channels
// ---------------------------------------------------------------------------

const MASK_FRAGMENT = /* wgsl */ `
struct MaskParams {
  threshold: f32,
  invert: u32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> params: MaskParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var maskTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let maskVal = textureSample(maskTex, samp, in.uv).r;
  var v = step(params.threshold, maskVal);
  if (params.invert != 0u) { v = 1.0 - v; }
  return vec4f(v, v, v, 1.0);
}
`

export const MASK_SHADER = VERTEX_SHADER + MASK_FRAGMENT

// ---------------------------------------------------------------------------
// channel.offset — chromatic aberration via per-channel UV offset
// Bindings: 0=uniform, 1=sampler, 2=imageTex
// ---------------------------------------------------------------------------

const CHANNEL_OFFSET_FRAGMENT = /* wgsl */ `
struct OffsetParams {
  rOffset: vec2f,
  gOffset: vec2f,
  bOffset: vec2f,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> params: OffsetParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let r = textureSample(imageTex, samp, in.uv + params.rOffset).r;
  let g = textureSample(imageTex, samp, in.uv + params.gOffset).g;
  let b = textureSample(imageTex, samp, in.uv + params.bOffset).b;
  let a = textureSample(imageTex, samp, in.uv).a;
  return vec4f(r, g, b, a);
}
`

export const CHANNEL_OFFSET_SHADER = VERTEX_SHADER + CHANNEL_OFFSET_FRAGMENT

// ---------------------------------------------------------------------------
// utility.mix — lerp between a and b by factor (from factor texture r-channel)
// Bindings: 0=uniform, 1=sampler, 2=texA, 3=texB, 4=factorTex
// If useDefaultFactor=1, use params.defaultFactor instead of sampling factorTex
// ---------------------------------------------------------------------------

const MIX_FRAGMENT = /* wgsl */ `
struct MixParams {
  defaultFactor: f32,
  useDefaultFactor: u32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> params: MixParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texA: texture_2d<f32>;
@group(0) @binding(3) var texB: texture_2d<f32>;
@group(0) @binding(4) var factorTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let a = textureSample(texA, samp, in.uv);
  let b = textureSample(texB, samp, in.uv);
  var factor: f32;
  if (params.useDefaultFactor != 0u) {
    factor = params.defaultFactor;
  } else {
    factor = textureSample(factorTex, samp, in.uv).r;
  }
  return mix(a, b, factor);
}
`

export const MIX_SHADER = VERTEX_SHADER + MIX_FRAGMENT
