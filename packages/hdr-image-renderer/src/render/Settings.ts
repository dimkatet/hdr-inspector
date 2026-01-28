/**
 * RenderSettings - Render option management
 *
 * Encapsulates render state (exposure, tone mapping, HDR mode, etc.)
 * with change notification for re-rendering.
 */

import type {
  ColorSpace,
  HDRCanvasOptions,
  ObjectFit,
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
  private objectFit: ObjectFit;
  private onChange: () => void;

  constructor(options: HDRCanvasOptions, onChange: () => void) {
    this.exposure = options.exposure ?? 0;
    this.toneMapping = options.toneMapping ?? 'aces';
    this.hdrMode = options.hdrMode ?? false;
    this.colorSpace = options.colorSpace ?? 'display-p3';
    this.visualizationMode = options.visualizationMode ?? 'rgb';
    this.objectFit = options.objectFit ?? 'contain';
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
      objectFit: this.objectFit,
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
   * Set object-fit mode
   */
  setObjectFit(mode: ObjectFit): void {
    this.objectFit = mode;
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
    if (options.objectFit !== undefined) this.objectFit = options.objectFit;

    this.onChange();
  }
}
