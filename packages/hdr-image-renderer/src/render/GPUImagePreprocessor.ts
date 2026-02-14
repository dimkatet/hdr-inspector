/**
 * GPU Implementation of ImagePreprocessor
 *
 * Uses WebGPU compute shader for efficient parallel processing of:
 * - RGB → RGBA conversion (adds alpha channel)
 * - Bit depth remapping (10/12-bit → 16-bit for Uint16)
 * - Row alignment (256-byte for copyBufferToTexture)
 *
 * Readback operations:
 * - BGRA → RGBA conversion
 * - Row padding removal (256-byte alignment)
 */

import type { Logger } from '../logger';
import { silentLogger } from '../logger';
import type { EncodedImageData, ImageData } from '../types';
import { getSharedDevice } from './gpu-device';
import type { ImageAnalysis, ImagePreprocessor, PreprocessedImage } from './ImagePreprocessor';
import { preprocessComputeShaderWGSL } from './shaders';

// WebGPU requires bytesPerRow to be a multiple of 256 for copyBufferToTexture
const BYTES_PER_ROW_ALIGNMENT = 256;

export class GPUImagePreprocessor implements ImagePreprocessor {
  private device!: GPUDevice;
  private computePipeline!: GPUComputePipeline;
  private computeBindGroupLayout!: GPUBindGroupLayout;
  private initialized = false;
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? silentLogger;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.device = await getSharedDevice();
    this.createComputePipeline();
    this.initialized = true;

    this.logger.log('[GPUImagePreprocessor] Initialized');
  }

  /**
   * Analyze image data to determine texture format and whether preprocessing is needed.
   * Pure function — no GPU operations.
   */
  analyze(image: ImageData): ImageAnalysis {
    let dataType: number;
    let textureFormat: GPUTextureFormat;
    let bytesPerChannel: number;
    let bitDepth: number;

    if (image.data instanceof Float32Array) {
      dataType = 0;
      textureFormat = 'rgba32float';
      bytesPerChannel = 4;
      bitDepth = 32;
    } else if (image.data instanceof Uint16Array) {
      dataType = 1;
      textureFormat = 'rgba16unorm';
      bytesPerChannel = 2;
      bitDepth = (image as EncodedImageData).bitDepth ?? 16;
    } else {
      dataType = 2;
      textureFormat = 'rgba8unorm';
      bytesPerChannel = 1;
      bitDepth = 8;
    }

    // Preprocessing needed if: RGB (not RGBA) OR Uint16 with non-16-bit depth
    const needsPreprocessing = image.channels !== 4 || (dataType === 1 && bitDepth !== 16);

    return {
      textureFormat,
      bytesPerChannel,
      dataType,
      bitDepth,
      transferFunction: image.transferFunction,
      needsPreprocessing,
    };
  }

  /**
   * Preprocess image on GPU: RGB→RGBA + bit depth remapping.
   * Returns a GPU buffer with 256-byte aligned rows for copyBufferToTexture.
   */
  async preprocess(image: ImageData, analysis: ImageAnalysis): Promise<PreprocessedImage> {
    if (!this.initialized) {
      throw new Error('GPUImagePreprocessor not initialized');
    }
    const { width, height, data, channels } = image;
    const { dataType, bitDepth, bytesPerChannel } = analysis;

    // Calculate 256-byte aligned row stride
    const bytesPerRow = alignTo(width * 4 * bytesPerChannel, BYTES_PER_ROW_ALIGNMENT);
    const rowStrideInU32 = bytesPerRow / 4;
    const outputBufferSize = bytesPerRow * height;

    // Input buffer
    const inputSizeAligned = alignTo(data.byteLength, 4);
    const inputBuffer = this.device.createBuffer({
      size: inputSizeAligned,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(inputBuffer, 0, data.buffer);
    // Output buffer (COPY_SRC for copyBufferToTexture)
    const outputBuffer = this.device.createBuffer({
      size: outputBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Params uniform
    const paramsData = new Uint32Array([
      width,
      height,
      channels,
      bitDepth,
      dataType,
      rowStrideInU32,
      0,
      0, // padding to 32 bytes
    ]);
    const paramsBuffer = this.device.createBuffer({
      size: paramsData.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(paramsBuffer, 0, paramsData.buffer);

    // Bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
    });

    // Encode and submit
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.computePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    // Wait for GPU
    await this.device.queue.onSubmittedWorkDone();

    // Cleanup input/params (output buffer returned to caller)
    inputBuffer.destroy();
    paramsBuffer.destroy();
    return {
      buffer: outputBuffer,
      textureFormat: analysis.textureFormat,
      width,
      height,
      bytesPerRow,
      transferFunction: analysis.transferFunction,
      destroy() {
        outputBuffer.destroy();
      },
    };
  }

  bgraToRgba(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 4) {
      result[i] = data[i + 2];
      result[i + 1] = data[i + 1];
      result[i + 2] = data[i];
      result[i + 3] = data[i + 3];
    }
    return result;
  }

  unpadRows(
    data: Uint8Array | Uint16Array,
    width: number,
    height: number,
    bytesPerRow: number,
    bytesPerChannel: number
  ): Uint8Array | Uint16Array {
    const actualBytesPerRow = width * 4 * bytesPerChannel;

    if (bytesPerRow === actualBytesPerRow) {
      return data;
    }

    const elementsPerRow = actualBytesPerRow / bytesPerChannel;
    const totalElements = elementsPerRow * height;

    const result =
      data instanceof Uint16Array ? new Uint16Array(totalElements) : new Uint8Array(totalElements);

    const paddedElementsPerRow = bytesPerRow / bytesPerChannel;

    for (let y = 0; y < height; y++) {
      const srcOffset = y * paddedElementsPerRow;
      const dstOffset = y * elementsPerRow;
      for (let x = 0; x < elementsPerRow; x++) {
        result[dstOffset + x] = data[srcOffset + x];
      }
    }

    return result;
  }

  destroy(): void {
    this.initialized = false;
  }

  private createComputePipeline(): void {
    const module = this.device.createShaderModule({
      code: preprocessComputeShaderWGSL,
    });

    this.computeBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.computeBindGroupLayout],
      }),
      compute: {
        module,
        entryPoint: 'preprocess_main',
      },
    });
  }
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}
