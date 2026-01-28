/**
 * WebGPU Shaders (WGSL)
 *
 * HDR rendering pipeline with exposure, tone mapping, and PQ encoding.
 */

export const preprocessComputeShaderWGSL = /* wgsl */ `
// Compute shader for image preprocessing:
// - RGB → RGBA conversion (adds alpha channel)
// - Bit depth remapping (10/12-bit → 16-bit)
// - Writes with 256-byte row alignment for copyBufferToTexture

struct PreprocessParams {
  width: u32,
  height: u32,
  channels: u32,         // 3 for RGB, 4 for RGBA
  bitDepth: u32,         // 8, 10, 12, or 16
  dataType: u32,         // 0 = Float32, 1 = Uint16, 2 = Uint8
  rowStrideInU32: u32,   // Output row stride in u32 units (256-byte aligned)
};

@group(0) @binding(0) var<storage, read> inputData: array<u32>;
@group(0) @binding(1) var<storage, read_write> outputData: array<u32>;
@group(0) @binding(2) var<uniform> params: PreprocessParams;

fn remapBitDepth(value: u32, bitDepth: u32) -> u32 {
  if (bitDepth == 16u) {
    return value;
  }
  let sourceMax = (1u << bitDepth) - 1u;
  let remapped = (value * 65535u) / sourceMax;
  return remapped;
}

// Read a u16 value from inputData at the given u16 index
fn readU16(u16Idx: u32) -> u32 {
  let u32Idx = u16Idx / 2u;
  let val = inputData[u32Idx];
  if (u16Idx % 2u == 0u) {
    return val & 0xFFFFu;
  }
  return (val >> 16u) & 0xFFFFu;
}

// Read a u8 value from inputData at the given byte index
fn readU8(byteIdx: u32) -> u32 {
  let u32Idx = byteIdx / 4u;
  let shift = (byteIdx % 4u) * 8u;
  return (inputData[u32Idx] >> shift) & 0xFFu;
}

@compute @workgroup_size(8, 8)
fn preprocess_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let x = global_id.x;
  let y = global_id.y;

  if (x >= params.width || y >= params.height) {
    return;
  }

  let pixelIdx = y * params.width + x;

  if (params.dataType == 0u) {
    // Float32: each float = 1 u32
    let inputOffset = pixelIdx * params.channels;
    let outputOffset = y * params.rowStrideInU32 + x * 4u;

    outputData[outputOffset + 0u] = inputData[inputOffset + 0u];
    outputData[outputOffset + 1u] = inputData[inputOffset + 1u];
    outputData[outputOffset + 2u] = inputData[inputOffset + 2u];
    if (params.channels == 3u) {
      outputData[outputOffset + 3u] = 0x3F800000u; // 1.0f IEEE 754
    } else {
      outputData[outputOffset + 3u] = inputData[inputOffset + 3u];
    }

  } else if (params.dataType == 1u) {
    // Uint16: 2 u16 per u32
    let inputU16Offset = pixelIdx * params.channels;

    var r = readU16(inputU16Offset);
    var g = readU16(inputU16Offset + 1u);
    var b = readU16(inputU16Offset + 2u);
    var a: u32;

    if (params.channels == 3u) {
      a = 65535u;
    } else {
      a = readU16(inputU16Offset + 3u);
      a = remapBitDepth(a, params.bitDepth);
    }

    r = remapBitDepth(r, params.bitDepth);
    g = remapBitDepth(g, params.bitDepth);
    b = remapBitDepth(b, params.bitDepth);

    // Output: 2 u16 per u32, row-aligned
    let outputU32Offset = y * params.rowStrideInU32 + x * 2u;
    outputData[outputU32Offset]      = r | (g << 16u);
    outputData[outputU32Offset + 1u] = b | (a << 16u);

  } else {
    // Uint8: 4 u8 per u32
    let inputByteOffset = pixelIdx * params.channels;

    let r = readU8(inputByteOffset);
    let g = readU8(inputByteOffset + 1u);
    let b = readU8(inputByteOffset + 2u);
    var a: u32;

    if (params.channels == 3u) {
      a = 255u;
    } else {
      a = readU8(inputByteOffset + 3u);
    }

    // Output: 1 pixel per u32, row-aligned
    let outputU32Offset = y * params.rowStrideInU32 + x;
    outputData[outputU32Offset] = r | (g << 8u) | (b << 16u) | (a << 24u);
  }
}
`;

export const vertexShaderWGSL = /* wgsl */ `
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

export const fragmentShaderWGSL = /* wgsl */ `
// Fragment shader for HDR rendering

// Bindings
@group(0) @binding(0) var hdrTexture: texture_2d<f32>;
@group(0) @binding(1) var hdrSampler: sampler;

struct Uniforms {
  exposure: f32,
  toneMapping: f32,      // 0=none, 1=reinhard, 2=aces
  visualizationMode: f32, // 0=rgb, 1=luminance, 2=clipping
  hdrMode: f32,           // 0=sRGB output, 1=PQ output
  colorSpace: f32,        // 0=srgb, 1=display-p3, 2=rec2020
  zoom: f32,              // Zoom level (1.0 = 100%)
  panX: f32,              // Pan offset X in normalized coords
  panY: f32,              // Pan offset Y in normalized coords
  imageAspect: f32,       // Image width / height
  canvasAspect: f32,      // Canvas width / height
  transparent: f32,       // 0=opaque background, 1=transparent
  inputTransferFunction: f32, // 0=linear, 1=srgb, 2=pq
  objectFit: f32,         // 0=contain, 1=cover, 2=fill, 3=none, 4=scale-down
  pixelScaleX: f32,       // imageWidth / canvasWidth (fraction of canvas image occupies at 1:1)
  pixelScaleY: f32,       // imageHeight / canvasHeight (fraction of canvas image occupies at 1:1)
  _pad: f32,              // alignment padding
};

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// BT.709 luminance weights
const BT709_WEIGHTS = vec3<f32>(0.2126, 0.7152, 0.0722);

// === Color Space Conversion Matrices ===

// BT.709 (sRGB primaries) to Display P3 (linear to linear)
// Source: http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
const MAT_BT709_TO_P3 = mat3x3<f32>(
  vec3<f32>(0.82246197, 0.17753803, 0.00000000),
  vec3<f32>(0.03319420, 0.96680580, 0.00000000),
  vec3<f32>(0.01708263, 0.07239744, 0.91051993)
);

// BT.709 to BT.2020 (linear to linear)
const MAT_BT709_TO_BT2020 = mat3x3<f32>(
  vec3<f32>(0.627404, 0.329283, 0.043313),
  vec3<f32>(0.069097, 0.919541, 0.011362),
  vec3<f32>(0.016391, 0.088013, 0.895595)
);

// === Utility Functions ===

fn luminance(rgb: vec3<f32>) -> f32 {
  return dot(rgb, BT709_WEIGHTS);
}

fn applyExposure(rgb: vec3<f32>, ev: f32) -> vec3<f32> {
  return rgb * pow(2.0, ev);
}

// Apply color space transformation from BT.709 to target color space
fn applyColorSpaceTransform(rgb: vec3<f32>, colorSpace: i32) -> vec3<f32> {
  if (colorSpace == 1) {
    // Display P3
    return MAT_BT709_TO_P3 * rgb;
  } else if (colorSpace == 2) {
    // BT.2020
    return MAT_BT709_TO_BT2020 * rgb;
  } else {
    // sRGB (BT.709) - no transform
    return rgb;
  }
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

// sRGB EOTF: encoded → linear (for decoding input)
fn srgbEOTF_scalar(encoded: f32) -> f32 {
  if (encoded <= 0.04045) {
    return encoded / 12.92;
  }
  return pow((encoded + 0.055) / 1.055, 2.4);
}

fn srgbEOTF(encoded: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    srgbEOTF_scalar(encoded.r),
    srgbEOTF_scalar(encoded.g),
    srgbEOTF_scalar(encoded.b)
  );
}

// PQ (ST.2084) EOTF: encoded → linear (for decoding HDR input)
// Output: scene-referred linear RGB where 1.0 = diffuse white (203 nits)
fn pqEOTF(encoded: vec3<f32>) -> vec3<f32> {
  // PQ constants (SMPTE ST 2084)
  let m1 = 0.1593017578125;      // 2610 / 16384
  let m2 = 78.84375;              // 2523 / 32 * 128
  let c1 = 0.8359375;             // 3424 / 4096
  let c2 = 18.8515625;            // 2413 / 128 * 32
  let c3 = 18.6875;               // 2392 / 128 * 32

  // Inverse PQ EOTF
  let Nm2 = pow(max(encoded, vec3<f32>(0.0)), vec3<f32>(1.0 / m2));
  let numerator = max(Nm2 - c1, vec3<f32>(0.0));
  let denominator = c2 - c3 * Nm2;
  let Y = pow(numerator / denominator, vec3<f32>(1.0 / m1));

  // Y is now in [0, 1] range representing [0, 10000] nits
  let absoluteNits = Y * 10000.0;

  // Convert to scene-referred: 1.0 = 203 nits (diffuse white)
  let diffuseWhiteNits = 203.0;
  return absoluteNits / diffuseWhiteNits;
}

// Linear to sRGB EOTF⁻¹ (for encoding output)
// Note: This function does NOT clamp - values > 1.0 are preserved!
fn srgbOEFT_scalar(linear: f32) -> f32 {
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
}

fn srgbOEFT(linear: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(
    srgbOEFT_scalar(linear.r),
    srgbOEFT_scalar(linear.g),
    srgbOEFT_scalar(linear.b)
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

// Apply object-fit transform
// Returns UV offset and scale to position image within canvas
// vec4: (scaleX, scaleY, offsetX, offsetY)
//   scaleX/Y = fraction of canvas the image occupies in each axis
//   offsetX/Y = canvas UV offset where the image starts
fn getFitTransform(imageAspect: f32, canvasAspect: f32, objectFit: i32, pixelScaleX: f32, pixelScaleY: f32) -> vec4<f32> {
  if (objectFit == 1) {
    // COVER: fill canvas completely, crop excess
    if (imageAspect > canvasAspect) {
      // Image is wider - fit to height, crop sides
      let scale = imageAspect / canvasAspect;
      return vec4<f32>(scale, 1.0, (1.0 - scale) / 2.0, 0.0);
    } else {
      // Image is taller - fit to width, crop top/bottom
      let scale = canvasAspect / imageAspect;
      return vec4<f32>(1.0, scale, 0.0, (1.0 - scale) / 2.0);
    }
  } else if (objectFit == 2) {
    // FILL: stretch to fill (no aspect ratio preservation)
    return vec4<f32>(1.0, 1.0, 0.0, 0.0);
  } else if (objectFit == 3) {
    // NONE: natural size (1:1 pixel mapping), centered
    return vec4<f32>(pixelScaleX, pixelScaleY, (1.0 - pixelScaleX) / 2.0, (1.0 - pixelScaleY) / 2.0);
  } else if (objectFit == 4) {
    // SCALE-DOWN: contain but never upscale
    if (pixelScaleX <= 1.0 && pixelScaleY <= 1.0) {
      // Image is smaller than canvas in both dimensions - use none (1:1)
      return vec4<f32>(pixelScaleX, pixelScaleY, (1.0 - pixelScaleX) / 2.0, (1.0 - pixelScaleY) / 2.0);
    }
    // Image exceeds canvas in at least one dimension - fall through to contain
  }

  // CONTAIN (default): fit entire image within canvas
  if (imageAspect > canvasAspect) {
    // Image is wider than canvas - fit to width, letterbox top/bottom
    let scale = canvasAspect / imageAspect;
    return vec4<f32>(1.0, scale, 0.0, (1.0 - scale) / 2.0);
  } else {
    // Image is taller than canvas - fit to height, pillarbox left/right
    let scale = imageAspect / canvasAspect;
    return vec4<f32>(scale, 1.0, (1.0 - scale) / 2.0, 0.0);
  }
}

// Apply zoom and pan to UV coordinates with object-fit correction
fn transformUV(uv: vec2<f32>, zoom: f32, panX: f32, panY: f32, imageAspect: f32, canvasAspect: f32, objectFit: i32, pixelScaleX: f32, pixelScaleY: f32) -> vec2<f32> {
  // Get fit transform based on object-fit mode
  let fit = getFitTransform(imageAspect, canvasAspect, objectFit, pixelScaleX, pixelScaleY);
  let scaleX = fit.x;
  let scaleY = fit.y;
  let offsetX = fit.z;
  let offsetY = fit.w;

  // Transform canvas UV to image UV (accounting for letterbox/pillarbox)
  var imageUV = vec2<f32>(
    (uv.x - offsetX) / scaleX,
    (uv.y - offsetY) / scaleY
  );

  // Apply zoom and pan (centered on image)
  let centered = imageUV - 0.5;
  let zoomed = centered / zoom;
  let panned = zoomed + vec2<f32>(panX, panY);
  return panned + 0.5;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Apply viewport transform (zoom/pan) with object-fit correction
  let transformedUV = transformUV(in.uv, uniforms.zoom, uniforms.panX, uniforms.panY, uniforms.imageAspect, uniforms.canvasAspect, i32(uniforms.objectFit), uniforms.pixelScaleX, uniforms.pixelScaleY);

  // Sample texture first (must be in uniform control flow)
  // Clamp UV to valid range for sampling
  let clampedUV = clamp(transformedUV, vec2<f32>(0.0), vec2<f32>(1.0));
  let texel = textureSample(hdrTexture, hdrSampler, clampedUV).rgb;

  // Decode input to linear RGB (scene-referred)
  var rgb: vec3<f32>;
  let inputTF = i32(uniforms.inputTransferFunction);
  if (inputTF == 1) {
    // sRGB encoded → linear
    rgb = srgbEOTF(texel);
  } else if (inputTF == 2) {
    // PQ encoded → linear (scene-referred, 1.0 = 203 nits)
    rgb = pqEOTF(texel);
  } else {
    // Already linear (inputTF == 0)
    rgb = texel;
  }

  // Check if UV is outside [0, 1] range
  let outOfBounds = transformedUV.x < 0.0 || transformedUV.x > 1.0 ||
                    transformedUV.y < 0.0 || transformedUV.y > 1.0;

  // If transparent mode and out of bounds, return transparent pixel
  if (outOfBounds && uniforms.transparent > 0.5) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  // For opaque mode, show black for out-of-bounds
  if (outOfBounds) {
    rgb = vec3<f32>(0.0, 0.0, 0.0);
  }

  // Apply exposure
  rgb = applyExposure(rgb, uniforms.exposure);

  var color: vec3<f32>;
  let vizMode = i32(uniforms.visualizationMode);
  let colorSpace = i32(uniforms.colorSpace);

  // HDR mode: Use standard (non-linear) color spaces with explicit encoding
  if (uniforms.hdrMode > 0.5) {
    // HDR mode pipeline:
    // 1. Apply exposure (can produce values > 1.0)
    // 2. Transform color space (BT.709 → target gamut)
    // 3. Apply transfer function (sRGB EOTF⁻¹)
    // 4. Output to rgba16float with toneMapping: extended
    //
    // Note: We use standard 'srgb'/'display-p3' (non-linear) because
    // '-linear' variants are experimental. The sRGB transfer function
    // doesn't clamp values > 1.0, which are preserved in float buffer
    // and passed to HDR display via extended tone mapping mode.

    if (vizMode == 1) {
      // False-color luminance (for visualization, apply tone mapping first)
      let tonemapped = toneMappingReinhard(rgb);
      let lum = luminance(tonemapped);
      color = turboColormap(lum);
      // Apply sRGB gamma for false-color visualization
      color = srgbOEFT(color);
    } else if (vizMode == 2) {
      // Clipping visualization
      let clipped = any(rgb > vec3<f32>(10.0));
      if (clipped) {
        color = vec3<f32>(1.0, 0.0, 1.0); // Magenta for clipped
      } else {
        color = srgbOEFT(color);
      }
    } else {
      // RGB mode: Apply color space transform + encoding
      color = srgbOEFT(rgb);
    }
  } else {
    // SDR mode: Apply tone mapping, color space transform, and gamma encoding
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

    // Apply gamma encoding (sRGB gamma curve)
    // Note: P3 and BT.2020 use same gamma as sRGB
    color = srgbOEFT(color);
  }

  return vec4<f32>(color, 1.0);
}
`;
