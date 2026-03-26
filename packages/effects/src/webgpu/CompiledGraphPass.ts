import type { ExecutionPlan, ExecutionStep } from '../graph/compiler';
import { NODE_PARAM_SCHEMAS, type StepParamInfo } from '../params';
import {
  buildUniformData,
  createNodePipeline,
  createUniformBuffer,
  NODE_SHADER_PORTS,
} from './pipelines';

// ---------------------------------------------------------------------------
// Structural local types — compatible with @dimkatet/hdr-canvas without
// importing it, relying on TypeScript structural typing.
// ---------------------------------------------------------------------------

interface MinimalPostProcessingAPI {
  addPass(pass: MinimalPass): void;
  removePass(name: string): void;
}

interface MinimalPass {
  readonly name: string;
  init(device: GPUDevice, format: GPUTextureFormat): void | Promise<void>;
  encode(encoder: GPUCommandEncoder, input: GPUTextureView, output: GPUTextureView): void;
  dispose?(): void;
}

export interface MinimalPluginCtx {
  readonly canvas: HTMLCanvasElement;
  readonly services: {
    get(name: 'postProcessing'): MinimalPostProcessingAPI;
  };
}

// ---------------------------------------------------------------------------
// CompiledGraphPass
// Executes an ExecutionPlan as a single PostProcessingPass.
// Manages all intermediate textures internally.
// ---------------------------------------------------------------------------

export class CompiledGraphPass implements MinimalPass {
  readonly name: string;

  // Set from init()
  private device: GPUDevice | null = null;
  private pipelines = new Map<string, GPURenderPipeline>();
  private bindGroupLayouts = new Map<string, GPUBindGroupLayout>();
  private uniformBuffers = new Map<string, GPUBuffer>();
  private sampler: GPUSampler | null = null;
  private defaultTexture: GPUTexture | null = null;
  private defaultView: GPUTextureView | null = null;

  // Set from setCanvas()
  private canvas: HTMLCanvasElement | null = null;

  // Step IDs for noise.2d nodes — updated by setViewportTransform()
  private noiseStepIds: string[] = [];

  // Mutable current params per step — source of truth for updateStepParam()
  private currentParams = new Map<string, Record<string, unknown>>();
  private stepsById = new Map<string, ExecutionStep>();

  // Lazily created / recreated on resize
  private stepTextures = new Map<string, GPUTexture>();
  private stepViews = new Map<string, GPUTextureView>();
  private lastWidth = 0;
  private lastHeight = 0;
  private readonly plan: ExecutionPlan;

  constructor(plan: ExecutionPlan, name = 'compiled-graph') {
    this.plan = plan;
    this.name = name;
    // Pre-populate so getParamInfo() returns meaningful data before init()
    for (const step of plan.steps) {
      this.stepsById.set(step.id, step);
      if (step.type !== 'source') {
        this.currentParams.set(step.id, { ...step.params });
      }
    }
  }

  /** Called by CompiledGraphPlugin.install() to provide canvas dimensions. */
  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  init(device: GPUDevice, format: GPUTextureFormat): void {
    this.device = device;

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    // 1×1 black default texture — used as fallback for unconnected optional ports
    this.defaultTexture = device.createTexture({
      size: { width: 1, height: 1 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      label: 'effects-default-black',
    });
    this.defaultView = this.defaultTexture.createView();
    // Clear to black
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.defaultView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.end();
    device.queue.submit([enc.finish()]);

    // Create per-type pipelines for all node types in the plan
    const usedTypes = new Set(
      this.plan.steps.filter((s) => s.type !== 'source').map((s) => s.type)
    );
    for (const type of usedTypes) {
      const { pipeline, bindGroupLayout } = createNodePipeline(device, format, type);
      this.pipelines.set(type, pipeline);
      this.bindGroupLayouts.set(type, bindGroupLayout);
    }

    // Create uniform buffer per non-source step; populate mutable param caches
    for (const step of this.plan.steps) {
      this.stepsById.set(step.id, step);
      if (step.type === 'source') continue;
      this.currentParams.set(step.id, { ...step.params });
      this.uniformBuffers.set(step.id, createUniformBuffer(device, step));
    }

    // Track noise step IDs for viewport transform updates
    // Both noise.2d and noise.fbm share the same uniform layout at offset 8 (zoom/pan)
    this.noiseStepIds = this.plan.steps
      .filter((s) => s.type === 'noise.2d' || s.type === 'noise.fbm')
      .map((s) => s.id);
  }

  /**
   * Update a single param of a step at runtime.
   * Rebuilds only the uniform buffer for that step — no pipeline recompilation.
   * Caller is responsible for triggering a re-render (postProcessing.requestRender()).
   */
  updateStepParam(stepId: string, name: string, value: unknown): void {
    if (!this.device) return;
    const params = this.currentParams.get(stepId);
    const step = this.stepsById.get(stepId);
    if (!params || !step) return;
    params[name] = value;
    const data = buildUniformData({ ...step, params });
    const buf = this.uniformBuffers.get(stepId);
    if (buf) this.device.queue.writeBuffer(buf, 0, data);
  }

  /**
   * Returns schema + current live values for all steps that have user-editable params.
   * Use this to build a generic parameter UI.
   */
  getParamInfo(): readonly StepParamInfo[] {
    return this.plan.steps.flatMap((step) => {
      const schema = NODE_PARAM_SCHEMAS[step.type];
      if (!schema) return [];
      return [
        {
          stepId: step.id,
          nodeType: step.type,
          label: this.currentParams.get(step.id)?.label as string | undefined,
          schema,
          values: { ...this.currentParams.get(step.id) },
        },
      ];
    });
  }

  /**
   * Update the viewport transform in all noise.2d uniform buffers.
   * Call this whenever zoom/pan changes (subscribe to viewport:update event).
   * Writes [zoom, _pad0, panX, panY] at byte offset 8 of each noise uniform buffer.
   */
  setViewportTransform(zoom: number, panX: number, panY: number): void {
    if (!this.device) return;
    const data = new Float32Array([zoom, 0, panX, panY]);
    for (const id of this.noiseStepIds) {
      const buf = this.uniformBuffers.get(id);
      if (buf) this.device.queue.writeBuffer(buf, 8, data);
    }
  }

  encode(encoder: GPUCommandEncoder, input: GPUTextureView, output: GPUTextureView): void {
    if (!this.device || !this.canvas || !this.sampler || !this.defaultView) return;

    const device = this.device;
    const { width, height } = this.canvas;

    // Recreate intermediate textures if canvas size changed
    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.destroyStepTextures();
      this.lastWidth = width;
      this.lastHeight = height;
    }

    // Build stepId → view registry
    const views = new Map<string, GPUTextureView>();

    const sourceStep = this.plan.steps.find((s) => s.type === 'source');
    if (sourceStep) views.set(sourceStep.id, input);

    for (const step of this.plan.steps) {
      if (step.type === 'source') continue;

      const isOutput = step.id === this.plan.outputId;
      const targetView = isOutput
        ? output
        : this.getOrCreateStepView(device, step.id, width, height);

      // Resolve input texture views by shader port order
      const shaderPorts = NODE_SHADER_PORTS[step.type] ?? [];
      const inputViews = shaderPorts.map(
        (port) => views.get(step.inputs[port] ?? '') ?? this.defaultView!
      );

      encodeStep(
        encoder,
        step,
        this.pipelines.get(step.type)!,
        this.bindGroupLayouts.get(step.type)!,
        this.sampler!,
        this.uniformBuffers.get(step.id)!,
        inputViews,
        targetView,
        device
      );

      if (!isOutput) {
        views.set(step.id, targetView);
      }
    }
  }

  dispose(): void {
    this.destroyStepTextures();
    for (const buf of this.uniformBuffers.values()) buf.destroy();
    this.uniformBuffers.clear();
    this.defaultTexture?.destroy();
    this.defaultTexture = null;
    this.defaultView = null;
    this.sampler = null;
    this.device = null;
  }

  private getOrCreateStepView(
    device: GPUDevice,
    stepId: string,
    width: number,
    height: number
  ): GPUTextureView {
    if (!this.stepTextures.has(stepId)) {
      const tex = device.createTexture({
        size: { width, height },
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        label: `effects-step-${stepId}`,
      });
      this.stepTextures.set(stepId, tex);
      this.stepViews.set(stepId, tex.createView());
    }
    return this.stepViews.get(stepId)!;
  }

  private destroyStepTextures(): void {
    for (const tex of this.stepTextures.values()) tex.destroy();
    this.stepTextures.clear();
    this.stepViews.clear();
  }
}

// ---------------------------------------------------------------------------
// Encode a single step as a fullscreen render pass
// ---------------------------------------------------------------------------

function encodeStep(
  encoder: GPUCommandEncoder,
  step: ExecutionStep,
  pipeline: GPURenderPipeline,
  bindGroupLayout: GPUBindGroupLayout,
  sampler: GPUSampler,
  uniformBuffer: GPUBuffer,
  inputViews: readonly GPUTextureView[],
  targetView: GPUTextureView,
  device: GPUDevice
): void {
  const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: uniformBuffer } }];

  if (inputViews.length > 0) {
    entries.push({ binding: 1, resource: sampler });
    for (let i = 0; i < inputViews.length; i++) {
      entries.push({ binding: 2 + i, resource: inputViews[i] });
    }
  }

  const bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries });

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: targetView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      },
    ],
    label: `effects-step-${step.id}`,
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(4);
  pass.end();
}

// ---------------------------------------------------------------------------
// CompiledGraphPlugin
// Thin HDRPlugin wrapper around CompiledGraphPass.
// Uses structural typing — no import from @dimkatet/hdr-canvas required.
// ---------------------------------------------------------------------------

export class CompiledGraphPlugin {
  readonly name: string;
  readonly pass: CompiledGraphPass;
  private postProcessing: MinimalPostProcessingAPI | null = null;

  constructor(plan: ExecutionPlan, name = 'compiled-graph') {
    this.name = name;
    this.pass = new CompiledGraphPass(plan, name);
  }

  install(ctx: MinimalPluginCtx): void {
    this.pass.setCanvas(ctx.canvas);
    this.postProcessing = ctx.services.get('postProcessing');
    this.postProcessing.addPass(this.pass);
  }

  uninstall(): void {
    this.postProcessing?.removePass(this.pass.name);
    this.postProcessing = null;
  }
}
