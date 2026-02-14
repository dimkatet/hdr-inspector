/**
 * PixelReader - GPU readback interface
 *
 * Abstracts pixel reading operations from rendered textures.
 * Extracted from WebGPURenderer to improve modularity and testability.
 */

export interface PixelValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Interface for reading pixel data from GPU textures
 */
export interface PixelReader {
  /**
   * Read pixel values from rendered texture at specific coordinates
   * @param x - X coordinate (0 to width-1)
   * @param y - Y coordinate (0 to height-1)
   * @returns RGBA values in [0, 1] range (scene-referred linear)
   */
  readPixel(x: number, y: number): Promise<PixelValue>;

  /**
   * Read rectangular region from texture
   * @param x - Starting X coordinate
   * @param y - Starting Y coordinate
   * @param width - Region width in pixels
   * @param height - Region height in pixels
   * @returns Float32Array with RGBA values (length = width * height * 4)
   */
  readRegion(x: number, y: number, width: number, height: number): Promise<Float32Array>;
}

/**
 * WebGPU implementation of PixelReader
 *
 * Reads pixel data from GPU textures using copyTextureToBuffer + buffer mapping.
 */
export class GPUPixelReader implements PixelReader {
  constructor(
    private device: GPUDevice,
    private getTexture: () => GPUTexture,
    private getTextureDimensions: () => { width: number; height: number }
  ) {}

  async readPixel(x: number, y: number): Promise<PixelValue> {
    const data = await this.readRegion(x, y, 1, 1);
    return {
      r: data[0],
      g: data[1],
      b: data[2],
      a: data[3],
    };
  }

  async readRegion(x: number, y: number, width: number, height: number): Promise<Float32Array> {
    const texture = this.getTexture();
    const dims = this.getTextureDimensions();

    // Validate region bounds
    if (x < 0 || y < 0 || x + width > dims.width || y + height > dims.height) {
      throw new Error(
        `Invalid region: (${x},${y},${width},${height}) exceeds texture bounds (${dims.width}x${dims.height})`
      );
    }

    // Calculate buffer size (rgba16float = 8 bytes per pixel)
    const bytesPerPixel = 8;
    const bytesPerRow = Math.ceil((width * bytesPerPixel) / 256) * 256; // WebGPU alignment
    const bufferSize = bytesPerRow * height;

    // Create staging buffer for readback
    const buffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    try {
      // Copy texture region to buffer
      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        {
          texture,
          origin: { x, y, z: 0 },
        },
        {
          buffer,
          bytesPerRow,
        },
        {
          width,
          height,
          depthOrArrayLayers: 1,
        }
      );
      this.device.queue.submit([encoder.finish()]);

      // Read back data
      await buffer.mapAsync(GPUMapMode.READ);
      const arrayBuffer = buffer.getMappedRange();

      // Convert to Float32Array (unpadded)
      const result = this.unpadRows(
        new Uint16Array(arrayBuffer.slice(0)),
        width,
        height,
        bytesPerRow
      );

      buffer.unmap();

      return result;
    } finally {
      buffer.destroy();
    }
  }

  /**
   * Remove row padding from GPU buffer data
   * WebGPU requires bytesPerRow to be a multiple of 256, so we need to remove padding
   */
  private unpadRows(
    data: Uint16Array,
    width: number,
    height: number,
    bytesPerRow: number
  ): Float32Array {
    const bytesPerPixel = 8;
    const actualRowBytes = width * bytesPerPixel;
    const uint16PerRow = bytesPerRow / 2;
    const actualUint16PerRow = actualRowBytes / 2;

    // If no padding, convert directly
    if (bytesPerRow === actualRowBytes) {
      return new Float32Array(data.buffer, data.byteOffset, data.length);
    }

    // Remove padding row by row
    const result = new Float32Array(width * height * 4);
    let srcOffset = 0;
    let dstOffset = 0;

    for (let row = 0; row < height; row++) {
      // Copy actual data (4 uint16 per pixel = r,g,b,a in half precision)
      const srcView = new Float32Array(
        data.buffer,
        data.byteOffset + srcOffset * 2,
        actualUint16PerRow
      );
      result.set(srcView, dstOffset);

      srcOffset += uint16PerRow;
      dstOffset += actualUint16PerRow;
    }

    return result;
  }
}
