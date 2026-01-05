/**
 * WebGL 2.0 HDR Renderer
 *
 * Renders linear HDR images using floating-point textures and GPU shaders.
 * Pipeline: Linear RGB → Exposure → Tone Mapping → sRGB Display
 */

import type { LinearImage, RenderState } from '../types';
import { vertexShaderSource, fragmentShaderSource } from './shaders';

/**
 * WebGL rendering context with shader program and resources
 */
export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  // Uniform locations
  private uniformLocations: {
    texture: WebGLUniformLocation | null;
    exposure: WebGLUniformLocation | null;
    toneMapping: WebGLUniformLocation | null;
    visualizationMode: WebGLUniformLocation | null;
  } = {
    texture: null,
    exposure: null,
    toneMapping: null,
    visualizationMode: null,
  };

  // Current image dimensions
  private imageWidth = 0;
  private imageHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
    });

    if (!gl) {
      throw new Error(
        'WebGL 2.0 not supported. Please use a modern browser.'
      );
    }

    // Enable float texture extension (required for RGBA32F)
    gl.getExtension('EXT_color_buffer_float');

    this.gl = gl;
    this.initialize();
  }

  /**
   * Initialize WebGL resources
   */
  private initialize(): void {
    const { gl } = this;

    console.log('[WebGLRenderer] Initializing...');

    // Create shader program
    this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);
    if (!this.program) {
      throw new Error('Failed to create shader program');
    }

    console.log('[WebGLRenderer] Shader program created successfully');

    gl.useProgram(this.program);

    // Get uniform locations
    this.uniformLocations = {
      texture: gl.getUniformLocation(this.program, 'u_texture'),
      exposure: gl.getUniformLocation(this.program, 'u_exposure'),
      toneMapping: gl.getUniformLocation(this.program, 'u_toneMapping'),
      visualizationMode: gl.getUniformLocation(
        this.program,
        'u_visualizationMode'
      ),
    };

    // Create fullscreen quad
    this.createFullscreenQuad();

    // Set default uniforms
    gl.uniform1i(this.uniformLocations.texture, 0); // Texture unit 0
    gl.uniform1f(this.uniformLocations.exposure, 0.0); // 0 EV
    gl.uniform1i(this.uniformLocations.toneMapping, 1); // Reinhard
    gl.uniform1i(this.uniformLocations.visualizationMode, 0); // RGB
  }

  /**
   * Create and compile a shader
   */
  private createShader(type: number, source: string): WebGLShader | null {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Create shader program from vertex and fragment shaders
   */
  private createProgram(
    vertexSource: string,
    fragmentSource: string
  ): WebGLProgram | null {
    const { gl } = this;

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    // Clean up shaders (no longer needed after linking)
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
  }

  /**
   * Create fullscreen quad geometry
   * Positions in clip space: [-1, 1]
   */
  private createFullscreenQuad(): void {
    const { gl } = this;

    // Fullscreen quad: two triangles covering [-1, 1] in clip space
    const positions = new Float32Array([
      -1, -1, // Bottom-left
      1, -1, // Bottom-right
      -1, 1, // Top-left
      -1, 1, // Top-left
      1, -1, // Bottom-right
      1, 1, // Top-right
    ]);

    // Create VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Create and bind VBO
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Set up vertex attribute
    const positionLoc = gl.getAttribLocation(this.program!, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Unbind
    gl.bindVertexArray(null);
  }

  /**
   * Upload HDR image to GPU as floating-point texture
   */
  uploadImage(image: LinearImage): void {
    const { gl } = this;

    this.imageWidth = image.width;
    this.imageHeight = image.height;

    console.log('[WebGLRenderer] Uploading texture:', image.width, 'x', image.height, 'channels:', image.channels);
    console.log('[WebGLRenderer] Data length:', image.data.length, 'expected:', image.width * image.height * 3);

    // Delete existing texture if any
    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    // Create texture
    this.texture = gl.createTexture();

    // Activate texture unit 0 and bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB32F, // 32-bit float RGB (guaranteed support in WebGL 2.0)
      image.width,
      image.height,
      0,
      gl.RGB,
      gl.FLOAT,
      image.data
    );

    // Check for WebGL errors
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error('[WebGLRenderer] WebGL error after texture upload:', error);
    }

    // Set texture parameters (no filtering, clamp to edge)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Don't unbind - leave texture bound to help with debugging
    // gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Render the HDR image with current render state
   */
  render(state: RenderState): void {
    const { gl } = this;

    if (!this.texture || !this.program || !this.vao) {
      console.warn('[WebGLRenderer] Cannot render: missing resources', {
        texture: !!this.texture,
        program: !!this.program,
        vao: !!this.vao,
      });
      return;
    }

    const canvas = gl.canvas as HTMLCanvasElement;
    console.log('[WebGLRenderer] Rendering:', {
      canvas: `${canvas.width}x${canvas.height}`,
      image: `${this.imageWidth}x${this.imageHeight}`,
      state,
    });

    // Set viewport to match canvas dimensions (not image dimensions!)
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Clear to black
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Use program
    gl.useProgram(this.program);

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // Update uniforms
    gl.uniform1f(this.uniformLocations.exposure, state.exposure);
    gl.uniform1i(
      this.uniformLocations.toneMapping,
      toneMappingOperatorToInt(state.toneMapping)
    );
    gl.uniform1i(
      this.uniformLocations.visualizationMode,
      visualizationModeToInt(state.mode)
    );

    // Draw fullscreen quad
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    // Check for errors
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error('[WebGLRenderer] WebGL error after render:', error);
    }
  }

  /**
   * Clean up WebGL resources
   */
  destroy(): void {
    const { gl } = this;

    if (this.texture) {
      gl.deleteTexture(this.texture);
      this.texture = null;
    }

    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
  }
}

/**
 * Convert tone mapping operator name to integer for shader uniform
 */
function toneMappingOperatorToInt(operator: string): number {
  switch (operator) {
    case 'none':
      return 0;
    case 'reinhard':
      return 1;
    case 'aces':
      return 2;
    default:
      return 1; // Default to Reinhard
  }
}

/**
 * Convert visualization mode name to integer for shader uniform
 */
function visualizationModeToInt(mode: string): number {
  switch (mode) {
    case 'rgb':
      return 0;
    case 'luminance':
      return 1;
    case 'clipping':
      return 2;
    default:
      return 0; // Default to RGB
  }
}
