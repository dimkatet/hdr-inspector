/**
 * ConfigResolver - Resolves HDRCanvasOptions into a fully-populated CoreConfig.
 *
 * Performs async capability detection for fields with auto-detect semantics.
 * The result is always fully resolved — no optional fields in renderOptions.
 */

import type { HDRCanvasOptions } from '../types';
import { detectHDRCapabilities } from '../utils/hdr-capabilities';
import type { CoreConfig } from './types';

/**
 * Resolve user options into a complete CoreConfig.
 *
 * Auto-detection logic:
 * - hdrMode: enabled if display + browser support HDR canvas (canvasHDR)
 * - colorSpace: display-p3 if display reports p3/rec2020 gamut, otherwise srgb
 * - toneMapping: 'none' in HDR mode (browser handles HDR), 'reinhard' in SDR mode
 *
 * Explicitly passed values always take priority over auto-detection.
 */
export async function resolveConfig(options: HDRCanvasOptions): Promise<CoreConfig> {
  const caps = await detectHDRCapabilities();

  const hdrMode = options.hdrMode ?? caps.canvasHDR;
  const colorSpace = options.colorSpace ?? (caps.colorGamut !== 'srgb' ? 'display-p3' : 'srgb');
  const toneMapping = options.toneMapping ?? (hdrMode ? 'none' : 'reinhard');

  return {
    debug: options.debug ?? false,
    transparent: options.transparent ?? false,
    renderer: options.renderer,
    renderOptions: {
      exposure: options.exposure ?? 0,
      toneMapping,
      hdrMode,
      colorSpace,
      visualizationMode: options.visualizationMode ?? 'rgb',
      objectFit: options.objectFit ?? 'contain',
    },
    userRenderOptions: {
      ...(options.exposure !== undefined && { exposure: options.exposure }),
      ...(options.toneMapping !== undefined && { toneMapping: options.toneMapping }),
      ...(options.hdrMode !== undefined && { hdrMode: options.hdrMode }),
      ...(options.colorSpace !== undefined && { colorSpace: options.colorSpace }),
      ...(options.visualizationMode !== undefined && {
        visualizationMode: options.visualizationMode,
      }),
      ...(options.objectFit !== undefined && { objectFit: options.objectFit }),
    },
  };
}
