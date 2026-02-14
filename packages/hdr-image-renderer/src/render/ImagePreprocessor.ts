/**
 * ImagePreprocessor Interface
 *
 * Abstracts image preprocessing operations (RGB→RGBA conversion, bit depth
 * remapping, row alignment) from specific implementation.
 *
 * Enables Dependency Inversion Principle and improved testability.
 */

import type { ImageData, TransferFunction } from '../types';

/**
 * Result of analyzing image data — determines processing requirements.
 */
export interface ImageAnalysis {
  textureFormat: GPUTextureFormat;
  bytesPerChannel: number;
  dataType: number; // 0 = Float32, 1 = Uint16, 2 = Uint8
  bitDepth: number;
  transferFunction: TransferFunction;
  needsPreprocessing: boolean;
}

/**
 * Result of preprocessing — GPU buffer ready for copyBufferToTexture.
 * Caller must call destroy() when done.
 */
export interface PreprocessedImage {
  buffer: GPUBuffer;
  textureFormat: GPUTextureFormat;
  width: number;
  height: number;
  bytesPerRow: number; // 256-byte aligned
  transferFunction: TransferFunction;
  destroy(): void;
}

/**
 * Interface for image preprocessing implementations.
 */
export interface ImagePreprocessor {
  /**
   * Initialize preprocessor (async for GPU resource creation)
   */
  initialize(): Promise<void>;

  /**
   * Analyze image data to determine texture format and preprocessing needs.
   * Pure function — no side effects.
   */
  analyze(image: ImageData): ImageAnalysis;

  /**
   * Preprocess image: RGB→RGBA + bit depth remapping + row alignment.
   * Returns GPU buffer ready for copyBufferToTexture.
   */
  preprocess(image: ImageData, analysis: ImageAnalysis): Promise<PreprocessedImage>;

  /**
   * Convert BGRA to RGBA (for readback operations)
   */
  bgraToRgba(data: Uint8Array): Uint8Array;

  /**
   * Remove row padding from buffer (for readback operations)
   */
  unpadRows(
    data: Uint8Array | Uint16Array,
    width: number,
    height: number,
    bytesPerRow: number,
    bytesPerChannel: number
  ): Uint8Array | Uint16Array;

  /**
   * Cleanup resources
   */
  destroy(): void;
}
