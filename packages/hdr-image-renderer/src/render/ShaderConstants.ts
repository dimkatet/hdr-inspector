/**
 * Shader Constants
 *
 * Utilities for converting TypeScript enums to shader constant indices.
 * These indices must match the shader code expectations.
 */

import type { ColorSpace, ObjectFit, TransferFunction } from '../types';

/**
 * Convert tone mapping mode to shader index
 */
export function getToneMappingIndex(mode: string): number {
  switch (mode) {
    case 'none':
      return 0;
    case 'reinhard':
      return 1;
    case 'aces':
      return 2;
    default:
      return 1; // Default to reinhard
  }
}

/**
 * Convert visualization mode to shader index
 */
export function getVisualizationModeIndex(mode: string): number {
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

/**
 * Convert color space to shader index
 */
export function getColorSpaceIndex(colorSpace: ColorSpace): number {
  switch (colorSpace) {
    case 'srgb':
      return 0;
    case 'display-p3':
      return 1;
    case 'rec2020':
      return 2;
  }
}

/**
 * Convert object-fit mode to shader index
 */
export function getObjectFitIndex(objectFit: ObjectFit): number {
  switch (objectFit) {
    case 'contain':
      return 0;
    case 'cover':
      return 1;
    case 'fill':
      return 2;
    case 'none':
      return 3;
    case 'scale-down':
      return 4;
  }
}

/**
 * Convert transfer function to shader index
 */
export function getTransferFunctionIndex(transferFunction: TransferFunction): number {
  switch (transferFunction) {
    case 'linear':
      return 0;
    case 'srgb':
      return 1;
    case 'pq':
      return 2;
  }
}
