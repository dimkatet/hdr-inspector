/**
 * WebGPU Shaders (WGSL)
 *
 * HDR rendering pipeline with exposure, tone mapping, and PQ encoding.
 */

export const vertexShaderWGSL = `
// Vertex shader for fullscreen quad

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Fullscreen triangle strip (4 vertices)
  // Positions: (-1,-1), (1,-1), (-1,1), (1,1)
  var positions = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, 1.0)
  );

  let pos = positions[vertexIndex];

  var output: VertexOutput;
  output.position = vec4<f32>(pos, 0.0, 1.0);

  // Convert clip space [-1, 1] to UV [0, 1]
  // Flip Y to match image orientation
  output.uv = pos * 0.5 + 0.5;
  output.uv.y = 1.0 - output.uv.y;

  return output;
}
`;

export const fragmentShaderWGSL = `
// Fragment shader for HDR rendering

// Bindings
@group(0) @binding(0) var hdrTexture: texture_2d<f32>;
@group(0) @binding(1) var hdrSampler: sampler;

struct Uniforms {
  exposure: f32,
  toneMapping: f32,      // 0=none, 1=reinhard, 2=aces
  visualizationMode: f32, // 0=rgb, 1=luminance, 2=clipping
  hdrMode: f32,           // 0=sRGB output, 1=PQ output
};

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// BT.709 luminance weights
const BT709_WEIGHTS = vec3<f32>(0.2126, 0.7152, 0.0722);

// === Utility Functions ===

fn luminance(rgb: vec3<f32>) -> f32 {
  return dot(rgb, BT709_WEIGHTS);
}

fn applyExposure(rgb: vec3<f32>, ev: f32) -> vec3<f32> {
  return rgb * pow(2.0, ev);
}

// === Tone Mapping Operators ===

fn toneMappingNone(rgb: vec3<f32>) -> vec3<f32> {
  return clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn toneMappingReinhard(rgb: vec3<f32>) -> vec3<f32> {
  return rgb / (1.0 + rgb);
}

fn toneMappingACES(rgb: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;

  return clamp((rgb * (a * rgb + b)) / (rgb * (c * rgb + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn applyToneMapping(rgb: vec3<f32>, op: i32) -> vec3<f32> {
  if (op == 0) {
    return toneMappingNone(rgb);
  } else if (op == 1) {
    return toneMappingReinhard(rgb);
  } else {
    return toneMappingACES(rgb);
  }
}

// === Transfer Functions ===

// Linear to sRGB (for SDR output)
fn linearToSRGB_scalar(linear: f32) -> f32 {
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
}

fn linearToSRGB(linear: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    linearToSRGB_scalar(linear.r),
    linearToSRGB_scalar(linear.g),
    linearToSRGB_scalar(linear.b)
  );
}

// Linear to PQ (ST.2084) for HDR output
// Input: scene-referred linear RGB where 1.0 = diffuse white
// diffuseWhiteNits: luminance of diffuse white in nits (typically 203 nits)
fn linearToPQ(linear: vec3<f32>, diffuseWhiteNits: f32) -> vec3<f32> {
  // Convert scene-referred to absolute luminance in nits
  // In scene-referred space: 1.0 = diffuse white, >1.0 = specular/emissive
  let absoluteNits = linear * diffuseWhiteNits;

  // Normalize to [0, 1] based on 10000 nits PQ reference
  let Y = absoluteNits / 10000.0;

  // Clamp to valid range (shouldn't exceed 10000 nits)
  let Y_clamped = clamp(Y, vec3<f32>(0.0), vec3<f32>(1.0));

  // PQ constants (SMPTE ST 2084)
  let m1 = 0.1593017578125;      // 2610 / 16384
  let m2 = 78.84375;              // 2523 / 32 * 128
  let c1 = 0.8359375;             // 3424 / 4096
  let c2 = 18.8515625;            // 2413 / 128 * 32
  let c3 = 18.6875;               // 2392 / 128 * 32

  let Ym1 = pow(Y_clamped, vec3<f32>(m1));
  let N = (c1 + c2 * Ym1) / (1.0 + c3 * Ym1);
  return pow(N, vec3<f32>(m2));
}

// === Turbo Colormap (for false-color visualization) ===

fn turboColormap(t_in: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.1140890109226559, 0.06288340699912215, 0.2248337216805064);
  let c1 = vec3<f32>(6.716419496985708, 3.182286745507602, 7.571581586103393);
  let c2 = vec3<f32>(-66.09402360453038, -4.9279827041226, -10.09439367561635);
  let c3 = vec3<f32>(228.7660791526501, 25.04986699771073, -91.54105330182436);
  let c4 = vec3<f32>(-334.8351565777451, -69.31749712757485, 288.5858850615712);
  let c5 = vec3<f32>(218.7637218434795, 67.52150567819112, -305.2045772184957);
  let c6 = vec3<f32>(-52.88903478218835, -21.54527364654712, 110.5174647748972);

  let t = clamp(t_in, 0.0, 1.0);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

// === Main Fragment Shader ===

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Sample HDR texture (linear scene-referred RGB)
  var rgb = textureSample(hdrTexture, hdrSampler, in.uv).rgb;

  // Apply exposure
  rgb = applyExposure(rgb, uniforms.exposure);

  var color: vec3<f32>;
  let vizMode = i32(uniforms.visualizationMode);

  // In HDR mode, output linear values directly (browser applies PQ automatically)
  if (uniforms.hdrMode > 0.5) {
    // HDR mode: Browser applies PQ encoding automatically when toneMapping: extended
    // Just output linear scene-referred RGB values

    if (vizMode == 1) {
      // False-color luminance (for visualization, apply tone mapping first)
      let tonemapped = toneMappingReinhard(rgb);
      let lum = luminance(tonemapped);
      color = turboColormap(lum);
      // For false-color, output in sRGB (not linear)
      color = linearToSRGB(color);
    } else if (vizMode == 2) {
      // Clipping visualization
      // Check if any channel > some threshold (e.g., 10.0 = very bright)
      let clipped = any(rgb > vec3<f32>(10.0));
      if (clipped) {
        color = vec3<f32>(1.0, 0.0, 1.0); // Magenta for clipped
      } else {
        // Output linear RGB directly
        color = rgb;
      }
    } else {
      // RGB mode: Output linear values directly
      // Browser will apply PQ encoding automatically
      // Scale to match expected brightness (adjust multiplier as needed)
      // Try values between 1.0 (current) and 2.5 (brighter midtones)
      color = rgb;
    }
  } else {
    // SDR mode: Apply tone mapping
    let op = i32(uniforms.toneMapping);
    var tonemapped = applyToneMapping(rgb, op);

    if (vizMode == 1) {
      // False-color luminance
      let lum = luminance(tonemapped);
      color = turboColormap(lum);
    } else if (vizMode == 2) {
      // Clipping visualization
      let clipped = any(tonemapped > vec3<f32>(1.0));
      if (clipped) {
        color = vec3<f32>(1.0, 0.0, 1.0); // Magenta
      } else {
        color = tonemapped;
      }
    } else {
      // RGB mode
      color = tonemapped;
    }

    // Apply sRGB encoding for SDR display
    color = linearToSRGB(color);
  }

  return vec4<f32>(color, 1.0);
}
`;
