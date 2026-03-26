/**
 * Post-Processing Pass Interface
 *
 * A single GPU pass in the post-processing chain.
 * All passes work exclusively with rgba16float textures, regardless of HDR/SDR mode.
 *
 * Lifecycle:
 *   1. Implement this interface
 *   2. Register via `ctx.services.get('postProcessing').addPass(myPass)`
 *   3. `init()` is called immediately (or on first render if added before runtime starts)
 *   4. `encode()` is called every frame
 *   5. `dispose()` is called when the pass is removed or the canvas is destroyed
 *
 * @example
 * const vignettePass: PostProcessingPass = {
 *   name: 'vignette',
 *   pipeline: null as any,
 *   bindGroupLayout: null as any,
 *
 *   init(device, format) {
 *     const shader = device.createShaderModule({ code: VIGNETTE_WGSL })
 *     this.bindGroupLayout = device.createBindGroupLayout({
 *       entries: [
 *         { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
 *         { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
 *       ],
 *     })
 *     this.pipeline = device.createRenderPipeline({
 *       layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
 *       vertex: { module: shader, entryPoint: 'vs_main' },
 *       fragment: { module: shader, entryPoint: 'fs_main', targets: [{ format }] },
 *       primitive: { topology: 'triangle-strip' },
 *     })
 *   },
 *
 *   encode(encoder, input, output) {
 *     const bindGroup = device.createBindGroup({
 *       layout: this.bindGroupLayout,
 *       entries: [
 *         { binding: 0, resource: input },
 *         { binding: 1, resource: sampler },
 *       ],
 *     })
 *     const pass = encoder.beginRenderPass({
 *       colorAttachments: [{ view: output, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }],
 *     })
 *     pass.setPipeline(this.pipeline)
 *     pass.setBindGroup(0, bindGroup)
 *     pass.draw(4)
 *     pass.end()
 *   },
 * }
 */

export interface PostProcessingPass {
  /** Unique name used for logging and `removePass()` */
  readonly name: string;

  /**
   * Called once when the pass is activated (runtime running + device available).
   * Create GPU pipelines, buffers, and bind group layouts here.
   *
   * @param device  - The WebGPU device
   * @param format  - Always `'rgba16float'` — input and output texture format
   */
  init(device: GPUDevice, format: GPUTextureFormat): void | Promise<void>;

  /**
   * Encode GPU commands for this pass. Called every frame.
   *
   * The pass must:
   * - Begin a render pass targeting `output`
   * - Sample from `input` to produce the result
   * - End the render pass
   *
   * @param encoder  - Command encoder to record into
   * @param input    - Input texture view (result of previous pass or main render)
   * @param output   - Output texture view (next pass input or blit target)
   */
  encode(encoder: GPUCommandEncoder, input: GPUTextureView, output: GPUTextureView): void;

  /**
   * Called when the pass is removed or the canvas is destroyed.
   * Release GPU resources (pipelines, buffers, etc.).
   */
  dispose?(): void;
}
