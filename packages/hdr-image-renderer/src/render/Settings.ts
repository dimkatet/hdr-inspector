/**
 * RenderSettings - Render option management
 *
 * Encapsulates render state (exposure, tone mapping, HDR mode, etc.)
 * with change notification for re-rendering.
 */

import type { HDRCanvasEventMap } from '../core/EventTypes';
import type { TypedEventBus } from '../core/TypedEventBus';
import type {
  ColorSpace,
  HDRCanvasOptions,
  ObjectFit,
  RenderAPI,
  RenderState,
  ToneMappingOperator,
  VisualizationMode,
} from '../types';

export class RenderSettings implements RenderAPI {
  private exposure: number;
  private toneMapping: ToneMappingOperator;
  private hdrMode: boolean;
  private colorSpace: ColorSpace;
  private visualizationMode: VisualizationMode;
  private objectFit: ObjectFit;
  private onChange: () => void;

  constructor(
    options: HDRCanvasOptions,
    onChange: () => void,
    private eventBus?: TypedEventBus<HDRCanvasEventMap>
  ) {
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
   * Notify about render settings change
   * Calls onChange callback and emits event via EventBus
   */
  private notifyChange(): void {
    this.onChange(); // Internal re-render
    this.eventBus?.emit('render:settingsChanged', { settings: this.getState() });
  }

  /**
   * Set exposure value in stops (EV)
   */
  setExposure(ev: number): void {
    this.exposure = ev;
    this.notifyChange();
  }

  /**
   * Set tone mapping operator
   */
  setToneMapping(operator: ToneMappingOperator): void {
    this.toneMapping = operator;
    this.notifyChange();
  }

  /**
   * Enable/disable HDR mode
   */
  setHDRMode(enabled: boolean): void {
    this.hdrMode = enabled;
    this.notifyChange();
  }

  /**
   * Set color space for output
   */
  setColorSpace(colorSpace: ColorSpace): void {
    this.colorSpace = colorSpace;
    this.notifyChange();
  }

  /**
   * Set visualization mode
   */
  setVisualizationMode(mode: VisualizationMode): void {
    this.visualizationMode = mode;
    this.notifyChange();
  }

  /**
   * Set object-fit mode
   */
  setObjectFit(mode: ObjectFit): void {
    this.objectFit = mode;
    this.notifyChange();
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

    this.notifyChange();
  }
}
