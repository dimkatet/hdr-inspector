/**
 * RenderSettings - Render option management
 *
 * Encapsulates render state (exposure, tone mapping, HDR mode, etc.)
 * with change notification for re-rendering.
 */

import type {
  ColorSpace,
  HDRCanvasOptions,
  RenderState,
  ToneMappingOperator,
  VisualizationMode,
} from '../types';

export class RenderSettings {
  private exposure: number;
  private toneMapping: ToneMappingOperator;
  private hdrMode: boolean;
  private colorSpace: ColorSpace;
  private visualizationMode: VisualizationMode;
  private onChange: () => void;

  constructor(options: HDRCanvasOptions, onChange: () => void) {
    this.exposure = options.exposure ?? 0;
    this.toneMapping = options.toneMapping ?? 'aces';
    this.hdrMode = options.hdrMode ?? false;
    this.colorSpace = options.colorSpace ?? 'display-p3';
    this.visualizationMode = options.visualizationMode ?? 'rgb';
    this.onChange = onChange;
  }

  /**
   * Get current render state
   */
  getState(): RenderState {
    return {
      exposure: this.exposure,
      toneMapping: this.toneMapping,
      hdrMode: this.hdrMode,
      colorSpace: this.colorSpace,
      visualizationMode: this.visualizationMode,
    };
  }

  /**
   * Set exposure value in stops (EV)
   */
  setExposure(ev: number): void {
    this.exposure = ev;
    this.onChange();
  }

  /**
   * Set tone mapping operator
   */
  setToneMapping(operator: ToneMappingOperator): void {
    this.toneMapping = operator;
    this.onChange();
  }

  /**
   * Enable/disable HDR mode
   */
  setHDRMode(enabled: boolean): void {
    this.hdrMode = enabled;
    this.onChange();
  }

  /**
   * Set color space for output
   */
  setColorSpace(colorSpace: ColorSpace): void {
    this.colorSpace = colorSpace;
    this.onChange();
  }

  /**
   * Set visualization mode
   */
  setVisualizationMode(mode: VisualizationMode): void {
    this.visualizationMode = mode;
    this.onChange();
  }

  /**
   * Batch update render options (single onChange call)
   */
  updateOptions(options: Partial<HDRCanvasOptions>): void {
    if (options.exposure !== undefined) this.exposure = options.exposure;
    if (options.toneMapping !== undefined) this.toneMapping = options.toneMapping;
    if (options.hdrMode !== undefined) this.hdrMode = options.hdrMode;
    if (options.colorSpace !== undefined) this.colorSpace = options.colorSpace;
    if (options.visualizationMode !== undefined) this.visualizationMode = options.visualizationMode;

    this.onChange();
  }
}
