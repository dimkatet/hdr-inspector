/**
 * RenderSettings - Render option management
 *
 * Maintains two layers of state:
 * - autoState: system-derived values (hardware detection, image metadata)
 * - userState: fields explicitly set by the user at runtime
 *
 * Effective state = { ...autoState, ...userState } — user always wins.
 * applyImageDefaults() updates only autoState, leaving user overrides intact.
 */

import type { DomainEventMap } from '../core/EventTypes';
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
  private autoState: RenderState;
  private userState: Partial<RenderState>;

  /**
   * @param autoState  - Fully resolved initial state (from ConfigResolver / hardware detection)
   * @param userOptions - Fields explicitly provided by the user in HDRCanvasOptions
   * @param eventBus   - Event bus for change notifications
   */
  constructor(
    autoState: RenderState,
    userOptions: Partial<RenderState>,
    private eventBus?: TypedEventBus<DomainEventMap>
  ) {
    this.autoState = autoState;
    this.userState = { ...userOptions };
  }

  // ============================================================
  // State access
  // ============================================================

  /**
   * Get effective render state: userState overrides autoState field-by-field.
   */
  getState(): RenderState {
    return { ...this.autoState, ...this.userState };
  }

  /**
   * Returns whether a field is user-controlled or auto-detected.
   * 'user' means the field has an explicit user override.
   * 'auto' means the field comes from hardware detection or image metadata.
   */
  getSettingSource(field: keyof RenderState): 'user' | 'auto' {
    return field in this.userState ? 'user' : 'auto';
  }

  // ============================================================
  // User setters — write to userState
  // ============================================================

  setExposure(ev: number): void {
    this.userState.exposure = ev;
    this.notifyChange();
  }

  setToneMapping(operator: ToneMappingOperator): void {
    this.userState.toneMapping = operator;
    this.notifyChange();
  }

  setHDRMode(enabled: boolean): void {
    this.userState.hdrMode = enabled;
    this.notifyChange();
  }

  setColorSpace(colorSpace: ColorSpace): void {
    this.userState.colorSpace = colorSpace;
    this.notifyChange();
  }

  setVisualizationMode(mode: VisualizationMode): void {
    this.userState.visualizationMode = mode;
    this.notifyChange();
  }

  setObjectFit(mode: ObjectFit): void {
    this.userState.objectFit = mode;
    this.notifyChange();
  }

  /**
   * Batch update render options. All provided fields go to userState.
   */
  updateOptions(options: Partial<HDRCanvasOptions>): void {
    if (options.exposure !== undefined) this.userState.exposure = options.exposure;
    if (options.toneMapping !== undefined) this.userState.toneMapping = options.toneMapping;
    if (options.hdrMode !== undefined) this.userState.hdrMode = options.hdrMode;
    if (options.colorSpace !== undefined) this.userState.colorSpace = options.colorSpace;
    if (options.visualizationMode !== undefined)
      this.userState.visualizationMode = options.visualizationMode;
    if (options.objectFit !== undefined) this.userState.objectFit = options.objectFit;
    this.notifyChange();
  }

  // ============================================================
  // System API — called by CanvasRuntime / ImageLoadingManager
  // ============================================================

  /**
   * Apply image-derived defaults to autoState.
   * Fields already in userState are not affected — user overrides survive image changes.
   */
  applyImageDefaults(derived: Partial<RenderState>): void {
    this.autoState = { ...this.autoState, ...derived };
    this.notifyChange();
  }

  /**
   * Remove a user override, returning the field to its auto-detected value.
   */
  resetField(field: keyof RenderState): void {
    delete this.userState[field];
    this.notifyChange();
  }

  // ============================================================
  // Private
  // ============================================================

  private notifyChange(): void {
    this.eventBus?.emit('render:settingsChanged', { settings: this.getState() });
  }
}
