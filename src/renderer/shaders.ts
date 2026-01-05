/**
 * GLSL Shaders for HDR Rendering
 *
 * Pipeline:
 * 1. Sample linear RGB from float texture
 * 2. Apply exposure (EV stops)
 * 3. Apply tone mapping
 * 4. Encode for sRGB display
 */

/**
 * Vertex shader: Fullscreen quad with texture coordinates
 */
export const vertexShaderSource = `#version 300 es
precision highp float;

// Vertex position (clip space: [-1, 1])
in vec2 a_position;

// Texture coordinates (UV: [0, 1])
out vec2 v_texCoord;

void main() {
  // Pass through texture coordinates (flip Y to match image orientation)
  v_texCoord = a_position * 0.5 + 0.5;
  v_texCoord.y = 1.0 - v_texCoord.y;

  // Position is already in clip space
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * Fragment shader: HDR rendering pipeline
 */
export const fragmentShaderSource = `#version 300 es
precision highp float;

// Texture coordinates from vertex shader
in vec2 v_texCoord;

// Output color
out vec4 fragColor;

// HDR texture (RGB32F)
uniform sampler2D u_texture;

// Exposure value in stops
uniform float u_exposure;

// Tone mapping operator
// 0 = none (clamp), 1 = Reinhard, 2 = ACES
uniform int u_toneMapping;

// Visualization mode
// 0 = RGB, 1 = false-color luminance, 2 = clipping
uniform int u_visualizationMode;

// BT.709 luminance weights
const vec3 BT709_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

/**
 * Compute luminance from linear RGB
 */
float luminance(vec3 rgb) {
  return dot(rgb, BT709_WEIGHTS);
}

/**
 * Apply exposure adjustment
 */
vec3 applyExposure(vec3 rgb, float ev) {
  return rgb * pow(2.0, ev);
}

/**
 * Tone mapping: None (explicit clamp)
 */
vec3 toneMappingNone(vec3 rgb) {
  return rgb;
}

/**
 * Tone mapping: Reinhard
 */
vec3 toneMappingReinhard(vec3 rgb) {
  return rgb / (1.0 + rgb);
}

/**
 * Tone mapping: ACES (Narkowicz 2015 fit)
 */
vec3 toneMappingACES(vec3 rgb) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;

  return clamp((rgb * (a * rgb + b)) / (rgb * (c * rgb + d) + e), 0.0, 1.0);
}

/**
 * Apply tone mapping based on operator selection
 */
vec3 applyToneMapping(vec3 rgb, int operator) {
  if (operator == 0) {
    return rgb;
  } else if (operator == 1) {
    return toneMappingReinhard(rgb);
  } else if (operator == 2) {
    return toneMappingACES(rgb);
  }
  return rgb;
}

/**
 * Linear to sRGB transfer function
 */
float linearToSRGB(float linear) {
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
}

vec3 linearToSRGBVec3(vec3 linear) {
  return vec3(
    linearToSRGB(linear.r),
    linearToSRGB(linear.g),
    linearToSRGB(linear.b)
  );
}

/**
 * Turbo colormap for false-color visualization
 * Perceptually uniform, from Google's Turbo colormap
 * Input: scalar in [0, 1]
 * Output: RGB in [0, 1]
 */
vec3 turboColormap(float t) {
  const vec3 c0 = vec3(0.1140890109226559, 0.06288340699912215, 0.2248337216805064);
  const vec3 c1 = vec3(6.716419496985708, 3.182286745507602, 7.571581586103393);
  const vec3 c2 = vec3(-66.09402360453038, -4.9279827041226, -10.09439367561635);
  const vec3 c3 = vec3(228.7660791526501, 25.04986699771073, -91.54105330182436);
  const vec3 c4 = vec3(-334.8351565777451, -69.31749712757485, 288.5858850615712);
  const vec3 c5 = vec3(218.7637218434795, 67.52150567819112, -305.2045772184957);
  const vec3 c6 = vec3(-52.88903478218835, -21.54527364654712, 110.5174068387621);

  t = clamp(t, 0.0, 1.0);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

void main() {
  // Sample linear RGB from HDR texture
  vec3 rgb = texture(u_texture, v_texCoord).rgb;

  // Apply exposure
  rgb = applyExposure(rgb, u_exposure);

  // Apply tone mapping
  vec3 tonemapped = applyToneMapping(rgb, u_toneMapping);

  // Visualization modes
  vec3 color;
  if (u_visualizationMode == 1) {
    // False-color luminance
    float lum = luminance(tonemapped);
    color = turboColormap(lum);
  } else if (u_visualizationMode == 2) {
    // Clipping visualization (post-tone-map)
    bool clipped = any(greaterThan(tonemapped, vec3(1.0)));
    if (clipped) {
      color = vec3(1.0, 0.0, 1.0); // Magenta
    } else {
      color = tonemapped;
    }
  } else {
    // Default: RGB mode
    color = tonemapped;
  }

  // Apply sRGB encoding for display
  // (Canvas assumes sRGB-encoded values, so we convert linear to sRGB)
  color = linearToSRGBVec3(color);

  fragColor = vec4(color, 1.0);
}
`;
