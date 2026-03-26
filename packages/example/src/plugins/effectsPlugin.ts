import {
  compile,
  createAnalogGlitch,
  createDuotone,
  createFilmGrain,
  createLiquidGlitch,
  createVignette,
  type StepParamInfo,
} from '@dimkatet/effects-graph';
import { CompiledGraphPass } from '@dimkatet/effects-graph/webgpu';
import type { HDRPlugin, PluginContext } from '@dimkatet/hdr-canvas';

// ---------------------------------------------------------------------------
// Preset registry
// ---------------------------------------------------------------------------

export const EFFECT_PRESETS = {
  'analog-glitch': { label: 'Analog Glitch', factory: () => compile(createAnalogGlitch()) },
  'liquid-glitch': { label: 'Liquid Glitch', factory: () => compile(createLiquidGlitch()) },
  'film-grain': { label: 'Film Grain', factory: () => compile(createFilmGrain()) },
  duotone: { label: 'Duotone', factory: () => compile(createDuotone()) },
  vignette: { label: 'Vignette', factory: () => compile(createVignette()) },
} as const;

export type EffectPresetName = keyof typeof EFFECT_PRESETS;

// ---------------------------------------------------------------------------
// EffectsPlugin — unified plugin holding all effect presets.
// Passes are compiled lazily and kept alive between preset switches.
// ---------------------------------------------------------------------------

export class EffectsPlugin implements HDRPlugin {
  readonly name = 'effects';

  // Lazily-created pass per preset (survive preset switches, reuse init())
  private readonly passes = new Map<string, CompiledGraphPass>();
  private activePresetName: EffectPresetName | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private postProcessing: {
    addPass(pass: object): void;
    removePass(name: string): void;
    requestRender(): void;
  } | null = null;
  private unsubViewport: (() => void) | null = null;

  install(ctx: PluginContext): void {
    this.canvas = ctx.canvas;
    this.postProcessing = ctx.services.get('postProcessing') as typeof this.postProcessing;

    // Forward viewport transform to all passes (keeps noise in image-space)
    this.unsubViewport = ctx.events.on('viewport:update', ({ state }) => {
      for (const pass of this.passes.values()) {
        pass.setViewportTransform(state.zoom, state.panX, state.panY);
      }
    });

    // Re-add active pass if plugin is reinstalled (e.g. after restart)
    if (this.activePresetName) {
      this.postProcessing?.addPass(this.getOrCreatePass(this.activePresetName));
    }
  }

  uninstall(): void {
    this.unsubViewport?.();
    this.unsubViewport = null;
    if (this.activePresetName) {
      this.postProcessing?.removePass(this.activePresetName);
    }
    this.postProcessing = null;
    this.canvas = null;
  }

  /** Switch to a preset, or pass null to disable all effects. */
  setPreset(name: EffectPresetName | null): void {
    if (name === this.activePresetName) return;

    // Remove current
    if (this.activePresetName) {
      this.postProcessing?.removePass(this.activePresetName);
    }

    this.activePresetName = name;

    // Add new
    if (name) {
      this.postProcessing?.addPass(this.getOrCreatePass(name));
    }
  }

  getActivePreset(): EffectPresetName | null {
    return this.activePresetName;
  }

  getParamInfo(): readonly StepParamInfo[] {
    if (!this.activePresetName) return [];
    return this.getOrCreatePass(this.activePresetName).getParamInfo();
  }

  updateParam(stepId: string, paramName: string, value: unknown): void {
    if (!this.activePresetName) return;
    this.passes.get(this.activePresetName)?.updateStepParam(stepId, paramName, value);
    this.postProcessing?.requestRender();
  }

  private getOrCreatePass(name: EffectPresetName): CompiledGraphPass {
    if (!this.passes.has(name)) {
      const pass = new CompiledGraphPass(EFFECT_PRESETS[name].factory(), name);
      if (this.canvas) pass.setCanvas(this.canvas);
      this.passes.set(name, pass);
    }
    return this.passes.get(name)!;
  }
}
