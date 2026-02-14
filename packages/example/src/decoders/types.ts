/**
 * Result of a decode operation with metadata
 */
export interface DecodeResult<T> {
  /** Decoded image data */
  data: T;

  /** Original image dimensions */
  width: number;
  height: number;

  /** Detected or specified color space */
  colorSpace?: 'srgb' | 'display-p3' | 'rec2020';

  /** Bit depth of source image */
  bitDepth?: 8 | 10 | 12 | 16 | 32;

  /** Additional format-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Error thrown during decoding
 */
export class DecodeError extends Error {
  public readonly format: string;
  public readonly cause?: unknown;

  constructor(message: string, format: string, cause?: unknown) {
    super(message);
    this.name = 'DecodeError';
    this.format = format;
    this.cause = cause;
  }
}
