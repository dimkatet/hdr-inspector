import { compile, createAnalogGlitch, type StepParamInfo } from '@dimkatet/effects-graph';
import { CompiledGraphPlugin } from '@dimkatet/effects-graph/webgpu';
import type { HDRPlugin, PluginContext } from '@dimkatet/hdr-canvas';

/** Analog glitch effect — horizontal warp + chromatic aberration + scanline mask. */
export class GlitchPlugin implements HDRPlugin {
  readonly name = 'glitch';

  private readonly inner: CompiledGraphPlugin;
  private enabled: boolean;
  private postProcessing: {
    addPass(pass: object): void;
    removePass(name: string): void;
    requestRender(): void;
  } | null = null;
  private unsubViewport: (() => void) | null = null;

  constructor(enabled = false) {
    this.enabled = enabled;
    this.inner = new CompiledGraphPlugin(compile(createAnalogGlitch()), 'glitch');
  }

  install(ctx: PluginContext): void {
    this.inner.pass.setCanvas(ctx.canvas);
    this.postProcessing = ctx.services.get('postProcessing') as typeof this.postProcessing;
    if (this.enabled) {
      this.postProcessing?.addPass(this.inner.pass);
    }
    this.unsubViewport = ctx.events.on('viewport:update', ({ state }) => {
      this.inner.pass.setViewportTransform(state.zoom, state.panX, state.panY);
    });
  }

  uninstall(): void {
    this.unsubViewport?.();
    this.unsubViewport = null;
    this.postProcessing?.removePass(this.inner.pass.name);
    this.postProcessing = null;
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.postProcessing?.addPass(this.inner.pass);
    } else {
      this.postProcessing?.removePass(this.inner.pass.name);
    }
  }

  getParamInfo(): readonly StepParamInfo[] {
    return this.inner.pass.getParamInfo();
  }

  updateParam(stepId: string, name: string, value: unknown): void {
    this.inner.pass.updateStepParam(stepId, name, value);
    this.postProcessing?.requestRender();
  }
}
