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
`;

// ---------------------------------------------------------------------------
// noise.2d — 2D gradient (Perlin-style) noise
// Bindings: 0=uniform
// Output: grayscale noise in [0,1] stored in all rgba channels
// ---------------------------------------------------------------------------

const NOISE_2D_FRAGMENT = /* wgsl */ `
struct NoiseParams {
  frequency:      f32,
  seed:           f32,
  // Viewport transform — updated each frame by GlitchPlugin via setViewportTransform()
  zoom:           f32,
  _pad0:          f32,
  panX:           f32,
  panY:           f32,
  // 0 = 'uv' (standard 2D noise), 1 = 'line' (constant per scanline — VHS/tape look)
  sampleDomain_f: f32,
  _pad1:          f32,
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

  // 'line' mode: use only Y coordinate so every pixel on the same scanline
  // gets the same noise value — produces horizontal bands (VHS/tape look).
  // X is fixed to seed-derived offset so different seeds give different patterns.
  var p: vec2f;
  if (params.sampleDomain_f > 0.5) {
    p = vec2f(params.seed * 1.7321, imageUV.y * params.frequency + params.seed * 3.1415);
  } else {
    p = imageUV * params.frequency + vec2f(params.seed * 1.7321, params.seed * 3.1415);
  }
  let val = perlin(p) * 0.5 + 0.5;
  return vec4f(val, val, val, 1.0);
}
`;

export const NOISE_2D_SHADER = VERTEX_SHADER + NOISE_2D_FRAGMENT;

// ---------------------------------------------------------------------------
// geometry.warp — horizontal scanline warp driven by a scalar field
// Bindings: 0=uniform, 1=sampler, 2=imageTex, 3=fieldTex
// ---------------------------------------------------------------------------

const WARP_FRAGMENT = /* wgsl */ `
struct WarpParams {
  strength:  f32,
  strengthY: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> params: WarpParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;
@group(0) @binding(3) var fieldTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let fieldVal = textureSample(fieldTex, samp, in.uv).r;
  // remap [0,1] → [-1,1] then scale by per-axis strength
  let base = fieldVal * 2.0 - 1.0;
  let warpedUV = vec2f(
    in.uv.x + base * params.strength,
    in.uv.y + base * params.strengthY,
  );
  return textureSample(imageTex, samp, warpedUV);
}
`;

export const WARP_SHADER = VERTEX_SHADER + WARP_FRAGMENT;

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
`;

export const MASK_SHADER = VERTEX_SHADER + MASK_FRAGMENT;

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
`;

export const CHANNEL_OFFSET_SHADER = VERTEX_SHADER + CHANNEL_OFFSET_FRAGMENT;

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
`;

export const MIX_SHADER = VERTEX_SHADER + MIX_FRAGMENT;

// ---------------------------------------------------------------------------
// noise.fbm — Fractional Brownian Motion (multi-octave Perlin)
// Bindings: 0=uniform
// Output: grayscale FBM in [0,1] stored in all rgba channels
// Uniform layout (same viewport offsets as noise.2d for setViewportTransform):
//   [0] frequency, [1] seed, [2] zoom, [3] _pad0
//   [4] panX, [5] panY, [6] persistence, [7] lacunarity, [8] octaves_f, ...
// ---------------------------------------------------------------------------

const NOISE_FBM_FRAGMENT = /* wgsl */ `
struct FBMParams {
  frequency:   f32,
  seed:        f32,
  zoom:        f32,
  _pad0:       f32,
  panX:        f32,
  panY:        f32,
  persistence: f32,
  lacunarity:  f32,
  octaves_f:   f32,
  _pad1:       f32,
  _pad2:       f32,
  _pad3:       f32,
}

@group(0) @binding(0) var<uniform> params: FBMParams;

fn hash2_fbm(p: vec2f) -> vec2f {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(q) * 43758.5453123);
}

fn perlin_fbm(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2_fbm(i + vec2f(0.0, 0.0)), f - vec2f(0.0, 0.0)),
        dot(hash2_fbm(i + vec2f(1.0, 0.0)), f - vec2f(1.0, 0.0)), u.x),
    mix(dot(hash2_fbm(i + vec2f(0.0, 1.0)), f - vec2f(0.0, 1.0)),
        dot(hash2_fbm(i + vec2f(1.0, 1.0)), f - vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Same image-space conversion as noise.2d
  let imageUV = (in.uv - 0.5) / params.zoom + vec2f(params.panX, params.panY) + 0.5;
  let seedOff = vec2f(params.seed * 1.7321, params.seed * 3.1415);

  var p = imageUV * params.frequency + seedOff;
  var value = 0.0;
  var amplitude = 1.0;
  var totalAmp = 0.0;
  let octaves = i32(params.octaves_f);

  for (var i = 0; i < 8; i++) {
    if (i >= octaves) { break; }
    value += perlin_fbm(p) * amplitude;
    totalAmp += amplitude;
    amplitude *= params.persistence;
    p *= params.lacunarity;
  }

  let val = (value / totalAmp) * 0.5 + 0.5;
  return vec4f(val, val, val, 1.0);
}
`;

export const NOISE_FBM_SHADER = VERTEX_SHADER + NOISE_FBM_FRAGMENT;

// ---------------------------------------------------------------------------
// color.transform — brightness, contrast, saturation, hue adjustment
// Bindings: 0=uniform, 1=sampler, 2=imageTex
// ---------------------------------------------------------------------------

const COLOR_TRANSFORM_FRAGMENT = /* wgsl */ `
struct ColorTransformParams {
  brightness: f32,
  contrast:   f32,
  saturation: f32,
  hue:        f32,
}

@group(0) @binding(0) var<uniform> params: ColorTransformParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;

fn rotateHue(rgb: vec3f, angle: f32) -> vec3f {
  let cosA = cos(angle);
  let sinA = sin(angle);
  let k = (1.0 - cosA) / 3.0;
  let s = sinA * 0.57735026919; // 1/sqrt(3)
  // Column-major mat3x3 (columns = transposed rows of the rotation matrix)
  let m = mat3x3f(
    vec3f(cosA + k,  k + s,  k - s),
    vec3f(k - s,  cosA + k,  k + s),
    vec3f(k + s,  k - s,  cosA + k),
  );
  return m * rgb;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(imageTex, samp, in.uv);
  var rgb = color.rgb;

  // Brightness: additive shift in linear space
  rgb = rgb + vec3f(params.brightness);

  // Contrast: scale around mid-gray (0.5 in display space, but we work linearly)
  rgb = (rgb - vec3f(0.5)) * params.contrast + vec3f(0.5);

  // Saturation: lerp toward luminance
  let luma = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3f(luma), rgb, params.saturation);

  // Hue rotation (angle in radians)
  rgb = rotateHue(rgb, params.hue);

  return vec4f(rgb, color.a);
}
`;

export const COLOR_TRANSFORM_SHADER = VERTEX_SHADER + COLOR_TRANSFORM_FRAGMENT;

// ---------------------------------------------------------------------------
// utility.math — scalar math between two scalar field textures
// Bindings: 0=uniform, 1=sampler, 2=texA, 3=texB
// Ops: 0=add, 1=subtract, 2=multiply, 3=step(a,b), 4=clamp(a, min, max)
// ---------------------------------------------------------------------------

const MATH_FRAGMENT = /* wgsl */ `
struct MathParams {
  op:       u32,
  clampMin: f32,
  clampMax: f32,
  _pad:     f32,
}

@group(0) @binding(0) var<uniform> params: MathParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texA: texture_2d<f32>;
@group(0) @binding(3) var texB: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let a = textureSample(texA, samp, in.uv).r;
  let b = textureSample(texB, samp, in.uv).r;
  var result: f32;
  switch (params.op) {
    case 0u: { result = a + b; }
    case 1u: { result = a - b; }
    case 2u: { result = a * b; }
    case 3u: { result = step(a, b); }    // step(edge=a, x=b): 0 if b<a, 1 otherwise
    case 4u: { result = clamp(a, params.clampMin, params.clampMax); }
    default: { result = a; }
  }
  return vec4f(result, result, result, 1.0);
}
`;

export const MATH_SHADER = VERTEX_SHADER + MATH_FRAGMENT;

// ---------------------------------------------------------------------------
// color.gradientMap — maps luminance through a gradient of up to 8 stops
// Bindings: 0=uniform, 1=sampler, 2=luminanceTex
// Uniform layout:
//   stops[8]: each = { color: vec3f, pos: f32 } = 16 bytes → 128 bytes total
//   numStops: u32 at offset 128
// ---------------------------------------------------------------------------

const GRADIENT_MAP_FRAGMENT = /* wgsl */ `
struct GradientStop {
  color: vec3f,
  pos:   f32,
}

struct GradientMapParams {
  stops:    array<GradientStop, 8>,
  numStops: u32,
  _pad0:    f32,
  _pad1:    f32,
  _pad2:    f32,
}

@group(0) @binding(0) var<uniform> params: GradientMapParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var luminanceTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let sample = textureSample(luminanceTex, samp, in.uv);
  // Works for both scalar noise (r=g=b) and full RGBA images (BT.709 luma)
  let luma = dot(sample.rgb, vec3f(0.2126, 0.7152, 0.0722));

  if (params.numStops == 0u) {
    return vec4f(luma, luma, luma, sample.a);
  }
  if (params.numStops == 1u) {
    return vec4f(params.stops[0].color, sample.a);
  }

  // Find surrounding stops and interpolate
  var outColor = params.stops[0].color;
  for (var i = 1u; i < params.numStops; i++) {
    let prev = params.stops[i - 1u];
    let curr = params.stops[i];
    if (luma <= curr.pos) {
      let range = curr.pos - prev.pos;
      let t = select(0.0, (luma - prev.pos) / range, range > 0.0);
      outColor = mix(prev.color, curr.color, t);
      break;
    }
    outColor = curr.color;
  }

  return vec4f(outColor, sample.a);
}
`;

export const GRADIENT_MAP_SHADER = VERTEX_SHADER + GRADIENT_MAP_FRAGMENT;

// ---------------------------------------------------------------------------
// effect.vignette — radial darkening centered at (0.5, 0.5)
// Bindings: 0=uniform, 1=sampler, 2=imageTex
// ---------------------------------------------------------------------------

const VIGNETTE_FRAGMENT = /* wgsl */ `
struct VignetteParams {
  strength:    f32,
  innerRadius: f32,
  outerRadius: f32,
  _pad:        f32,
}

@group(0) @binding(0) var<uniform> params: VignetteParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(imageTex, samp, in.uv);
  let dist = distance(in.uv, vec2f(0.5));
  let mask = smoothstep(params.innerRadius, params.outerRadius, dist);
  let factor = 1.0 - mask * params.strength;
  return vec4f(color.rgb * factor, color.a);
}
`;

export const VIGNETTE_SHADER = VERTEX_SHADER + VIGNETTE_FRAGMENT;

// ---------------------------------------------------------------------------
// utility.blend — blend image with a field using various modes
// Bindings: 0=uniform, 1=sampler, 2=imageTex, 3=fieldTex
// Field is sampled from r-channel (works with scalar noise outputs)
// Modes: 0=add, 1=multiply, 2=screen, 3=overlay
// ---------------------------------------------------------------------------

const BLEND_FRAGMENT = /* wgsl */ `
struct BlendParams {
  mode:      u32,
  intensity: f32,
  _pad0:     f32,
  _pad1:     f32,
}

@group(0) @binding(0) var<uniform> params: BlendParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;
@group(0) @binding(3) var fieldTex: texture_2d<f32>;

fn overlay_channel(base: f32, blend: f32) -> f32 {
  return select(
    1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
    2.0 * base * blend,
    base < 0.5,
  );
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let img = textureSample(imageTex, samp, in.uv);
  let f = textureSample(fieldTex, samp, in.uv).r * params.intensity;
  var rgb = img.rgb;
  switch (params.mode) {
    case 0u: { // add
      rgb = rgb + vec3f(f);
    }
    case 1u: { // multiply
      rgb = rgb * mix(vec3f(1.0), vec3f(f), params.intensity);
    }
    case 2u: { // screen (operates in [0,1])
      let b = clamp(img.rgb, vec3f(0.0), vec3f(1.0));
      rgb = vec3f(1.0) - (vec3f(1.0) - b) * vec3f(1.0 - f);
    }
    case 3u: { // overlay
      let b = clamp(img.rgb, vec3f(0.0), vec3f(1.0));
      rgb = vec3f(
        overlay_channel(b.r, f),
        overlay_channel(b.g, f),
        overlay_channel(b.b, f),
      );
    }
    default: { rgb = rgb; }
  }
  return vec4f(rgb, img.a);
}
`;

export const BLEND_SHADER = VERTEX_SHADER + BLEND_FRAGMENT;

// ---------------------------------------------------------------------------
// utility.lumaMask — extracts BT.709 luminance and applies smoothstep mask
// Bindings: 0=uniform, 1=sampler, 2=imageTex
// Output: grayscale mask in [0,1] stored in all rgba channels
// ---------------------------------------------------------------------------

const LUMA_MASK_FRAGMENT = /* wgsl */ `
struct LumaMaskParams {
  low:  f32,
  high: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> params: LumaMaskParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(imageTex, samp, in.uv);
  let luma = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let mask = smoothstep(params.low, params.high, luma);
  return vec4f(mask, mask, mask, 1.0);
}
`;

export const LUMA_MASK_SHADER = VERTEX_SHADER + LUMA_MASK_FRAGMENT;

// ---------------------------------------------------------------------------
// geometry.domainWarp — two-pass domain-warped FBM distortion
// Bindings: 0=uniform, 1=sampler, 2=imageTex
//
// Pass 1: uv1 = uv  + vec2(fbm(uv  * freq + s1), fbm(uv  * freq + s2)) * strength1
// Pass 2: uv2 = uv1 + vec2(fbm(uv1 * freq + s1), fbm(uv1 * freq + s2)) * strength2
// The second pass samples FBM at the already-warped UV — this is true domain warping
// and produces coherent, fluid-like distortion unlike sequential scalar warps.
// ---------------------------------------------------------------------------

const DOMAIN_WARP_FRAGMENT = /* wgsl */ `
struct DomainWarpParams {
  frequency:   f32,
  strength1:   f32,
  strength2:   f32,
  seed:        f32,
  persistence: f32,
  octaves_f:   f32,
  _pad0:       f32,
  _pad1:       f32,
}

@group(0) @binding(0) var<uniform> params: DomainWarpParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;

fn hash2_dw(p: vec2f) -> vec2f {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(q) * 43758.5453123);
}

fn perlin_dw(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2_dw(i + vec2f(0.0, 0.0)), f - vec2f(0.0, 0.0)),
        dot(hash2_dw(i + vec2f(1.0, 0.0)), f - vec2f(1.0, 0.0)), u.x),
    mix(dot(hash2_dw(i + vec2f(0.0, 1.0)), f - vec2f(0.0, 1.0)),
        dot(hash2_dw(i + vec2f(1.0, 1.0)), f - vec2f(1.0, 1.0)), u.x),
    u.y,
  );
}

// Returns a vec2 displacement from two independent FBM evaluations.
// seedOff1/seedOff2 are different offsets so X and Y displacements are uncorrelated.
fn fbm_vec2(p: vec2f, octaves: i32, persistence: f32) -> vec2f {
  let seedOff1 = vec2f(params.seed * 1.7321, params.seed * 3.1415);
  let seedOff2 = vec2f(params.seed * 2.3456 + 5.1753, params.seed * 1.6180 + 3.0);

  var dx = 0.0; var dy = 0.0;
  var amp = 1.0; var totalAmp = 0.0;
  var pp = p;
  for (var i = 0; i < 8; i++) {
    if (i >= octaves) { break; }
    dx += perlin_dw(pp + seedOff1) * amp;
    dy += perlin_dw(pp + seedOff2) * amp;
    totalAmp += amp;
    amp *= persistence;
    pp *= 2.0;
  }
  return vec2f(dx, dy) / totalAmp; // normalised to [-1, 1]
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let octaves = i32(params.octaves_f);
  let p0 = in.uv * params.frequency;

  // First warp pass
  let flow1 = fbm_vec2(p0, octaves, params.persistence);
  let uv1 = in.uv + flow1 * params.strength1;

  // Second warp pass — FBM evaluated at the warped UV (domain warping)
  let flow2 = fbm_vec2(uv1 * params.frequency, octaves, params.persistence);
  let uv2 = uv1 + flow2 * params.strength2;

  return textureSample(imageTex, samp, uv2);
}
`;

export const DOMAIN_WARP_SHADER = VERTEX_SHADER + DOMAIN_WARP_FRAGMENT;

// ---------------------------------------------------------------------------
// utility.pixelate — quantizes UV to a block grid (mosaic / pixelation)
// Bindings: 0=uniform, 1=sampler, 2=imageTex
// ---------------------------------------------------------------------------

const PIXELATE_FRAGMENT = /* wgsl */ `
struct PixelateParams {
  blockSize: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: PixelateParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  // Snap UV to the centre of the nearest block
  let blockUV = (floor(in.uv * params.blockSize) + 0.5) / params.blockSize;
  return textureSample(imageTex, samp, blockUV);
}
`;

export const PIXELATE_SHADER = VERTEX_SHADER + PIXELATE_FRAGMENT;

// ---------------------------------------------------------------------------
// geometry.blockWarp — per-block random UV displacement (digital glitch)
// Bindings: 0=uniform, 1=sampler, 2=imageTex
//
// Divides the image into a coarse 12×12 grid. Each block gets a deterministic
// random displacement based on its grid coordinate + seed. ~30% of blocks are
// displaced (step threshold at 0.7) to produce sparse, realistic corruption.
// ---------------------------------------------------------------------------

const BLOCK_WARP_FRAGMENT = /* wgsl */ `
struct BlockWarpParams {
  strengthX: f32,
  strengthY: f32,
  seed:      f32,
  _pad:      f32,
}

@group(0) @binding(0) var<uniform> params: BlockWarpParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;

fn hash2_bw(p: vec2f) -> vec2f {
  let q = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(q) * 43758.5453123); // [0, 1]
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let gridSize = 12.0;
  let blockCoord = floor(in.uv * gridSize);
  let h = hash2_bw(blockCoord + vec2f(params.seed * 0.137));

  // Only ~30% of blocks are displaced (step at 0.7)
  let doGlitch = step(0.7, h.x);
  let offset = (h * 2.0 - 1.0) * vec2f(params.strengthX, params.strengthY) * doGlitch;

  return textureSample(imageTex, samp, in.uv + offset);
}
`;

export const BLOCK_WARP_SHADER = VERTEX_SHADER + BLOCK_WARP_FRAGMENT;
