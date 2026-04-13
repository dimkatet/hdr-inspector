/**
 * Tests for CompiledGraphPass — GPU execution engine.
 *
 * Strategy: inject a mock GPUDevice so we can test parameter management,
 * viewport transform forwarding, and dispose() without a real GPU.
 * encode() is not tested here (requires actual texture views + canvas).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compile } from '../graph/compiler'
import {
  createAnalogVHS,
  createFilmGrain,
  createNeonSignal,
  createVignette,
} from '../index'
import { CompiledGraphPass, CompiledGraphPlugin } from '../webgpu/CompiledGraphPass'
import { createMockDevice } from './helpers/mockGPU'

const FORMAT: GPUTextureFormat = 'rgba16float'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVignettePass(name = 'test') {
  return new CompiledGraphPass(compile(createVignette()), name)
}

// ---------------------------------------------------------------------------
// Constructor / getParamInfo() before init()
// ---------------------------------------------------------------------------

describe('CompiledGraphPass constructor', () => {
  it('name is set from constructor argument', () => {
    const pass = makeVignettePass('my-effect')
    expect(pass.name).toBe('my-effect')
  })

  it('defaults name to "compiled-graph"', () => {
    const pass = new CompiledGraphPass(compile(createVignette()))
    expect(pass.name).toBe('compiled-graph')
  })

  it('getParamInfo() returns step info without calling init()', () => {
    const pass = makeVignettePass()
    const info = pass.getParamInfo()
    expect(info.length).toBeGreaterThan(0)
  })

  it('getParamInfo() includes effect.vignette step', () => {
    const pass = makeVignettePass()
    const info = pass.getParamInfo()
    const vig = info.find((i) => i.nodeType === 'effect.vignette')
    expect(vig).toBeDefined()
  })

  it('getParamInfo() has schema and current values for each step', () => {
    const pass = makeVignettePass()
    for (const step of pass.getParamInfo()) {
      expect(step.stepId).toBeTruthy()
      expect(step.nodeType).toBeTruthy()
      expect(step.schema).toBeTruthy()
      expect(step.values).toBeTruthy()
    }
  })

  it('source node is excluded from getParamInfo()', () => {
    const pass = makeVignettePass()
    const info = pass.getParamInfo()
    expect(info.every((i) => i.nodeType !== 'source')).toBe(true)
  })

  it('param values reflect the plan params before init()', () => {
    const pass = new CompiledGraphPass(compile(createVignette({ strength: 0.3 })))
    const vig = pass.getParamInfo().find((i) => i.nodeType === 'effect.vignette')!
    expect(vig.values.strength).toBe(0.3)
  })
})

// ---------------------------------------------------------------------------
// init() with mock GPU
// ---------------------------------------------------------------------------

describe('CompiledGraphPass.init()', () => {
  let device: GPUDevice

  beforeEach(() => {
    ;({ device } = createMockDevice())
  })

  it('creates a sampler', () => {
    const pass = makeVignettePass()
    pass.init(device, FORMAT)
    expect(device.createSampler).toHaveBeenCalledOnce()
  })

  it('creates a default black texture', () => {
    const pass = makeVignettePass()
    pass.init(device, FORMAT)
    // First createTexture call is the default black texture
    expect(device.createTexture).toHaveBeenCalled()
  })

  it('creates one pipeline per unique non-source node type', () => {
    const plan = compile(createVignette()) // source + vignette → 1 unique non-source type
    const pass = new CompiledGraphPass(plan)
    pass.init(device, FORMAT)
    expect(device.createRenderPipeline).toHaveBeenCalledTimes(1)
  })

  it('creates one uniform buffer per non-source step', () => {
    const plan = compile(createVignette()) // 2 steps total, 1 non-source
    const pass = new CompiledGraphPass(plan)
    pass.init(device, FORMAT)
    // createBuffer is called once for the vignette uniform
    const bufferCalls = (device.createBuffer as ReturnType<typeof vi.fn>).mock.calls
    expect(bufferCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('filmGrain creates pipelines for noise.2d and utility.blend', () => {
    const pass = new CompiledGraphPass(compile(createFilmGrain()))
    pass.init(device, FORMAT)
    // 2 unique non-source types: noise.2d + utility.blend
    expect(device.createRenderPipeline).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// updateStepParam() after init()
// ---------------------------------------------------------------------------

describe('CompiledGraphPass.updateStepParam()', () => {
  let device: GPUDevice
  let queue: { writeBuffer: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    ;({ device, queue } = createMockDevice())
  })

  it('updates the value in getParamInfo()', () => {
    const pass = makeVignettePass()
    pass.init(device, FORMAT)

    const [info] = pass.getParamInfo()
    pass.updateStepParam(info.stepId, 'strength', 0.99)

    const updated = pass.getParamInfo().find((i) => i.stepId === info.stepId)!
    expect(updated.values.strength).toBe(0.99)
  })

  it('calls device.queue.writeBuffer for the step buffer', () => {
    const pass = makeVignettePass()
    pass.init(device, FORMAT)
    queue.writeBuffer.mockClear()

    const [info] = pass.getParamInfo()
    pass.updateStepParam(info.stepId, 'strength', 0.5)

    expect(queue.writeBuffer).toHaveBeenCalled()
    // Writes starting at byte offset 0
    const [, offset] = queue.writeBuffer.mock.calls[0]
    expect(offset).toBe(0)
  })

  it('updating multiple params accumulates in values', () => {
    const pass = makeVignettePass()
    pass.init(device, FORMAT)

    const [info] = pass.getParamInfo()
    pass.updateStepParam(info.stepId, 'strength', 0.5)
    pass.updateStepParam(info.stepId, 'innerRadius', 0.2)

    const updated = pass.getParamInfo().find((i) => i.stepId === info.stepId)!
    expect(updated.values.strength).toBe(0.5)
    expect(updated.values.innerRadius).toBe(0.2)
  })

  it('no-ops silently when called before init()', () => {
    const pass = makeVignettePass()
    const [info] = pass.getParamInfo()
    // Should not throw — device is null before init
    expect(() => pass.updateStepParam(info.stepId, 'strength', 0.5)).not.toThrow()
  })

  it('no-ops silently for an unknown stepId', () => {
    const pass = makeVignettePass()
    pass.init(device, FORMAT)
    expect(() => pass.updateStepParam('does-not-exist', 'strength', 1)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// setViewportTransform()
// ---------------------------------------------------------------------------

describe('CompiledGraphPass.setViewportTransform()', () => {
  let device: GPUDevice
  let queue: { writeBuffer: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    ;({ device, queue } = createMockDevice())
  })

  it('no-ops silently before init()', () => {
    const pass = new CompiledGraphPass(compile(createNeonSignal()))
    expect(() => pass.setViewportTransform(2, 0.1, -0.1)).not.toThrow()
  })

  it('writes to queue after init() when noise nodes are present', () => {
    const pass = new CompiledGraphPass(compile(createNeonSignal()))
    pass.init(device, FORMAT)
    queue.writeBuffer.mockClear()

    pass.setViewportTransform(2.0, 0.1, -0.1)

    expect(queue.writeBuffer).toHaveBeenCalled()
  })

  it('writes at byte offset 8 (noise uniform layout: zoom/panX/panY start there)', () => {
    const pass = new CompiledGraphPass(compile(createNeonSignal()))
    pass.init(device, FORMAT)
    queue.writeBuffer.mockClear()

    pass.setViewportTransform(2.0, 0.1, -0.1)

    // Every call to writeBuffer from setViewportTransform uses offset 8
    for (const [, offset] of queue.writeBuffer.mock.calls) {
      expect(offset).toBe(8)
    }
  })

  it('writes [zoom, 0, panX, panY] to the buffer', () => {
    const pass = new CompiledGraphPass(compile(createNeonSignal()))
    pass.init(device, FORMAT)
    queue.writeBuffer.mockClear()

    pass.setViewportTransform(3.0, 0.25, -0.5)

    const [, , data] = queue.writeBuffer.mock.calls[0]
    const v = new Float32Array(data.buffer ?? data)
    expect(v[0]).toBeCloseTo(3.0)   // zoom
    expect(v[1]).toBeCloseTo(0)     // _pad
    expect(v[2]).toBeCloseTo(0.25)  // panX
    expect(v[3]).toBeCloseTo(-0.5)  // panY
  })

  it('calls writeBuffer once per noise step', () => {
    const plan = compile(createAnalogVHS()) // has multiple noise.2d steps
    const noiseSteps = plan.steps.filter((s) => s.type === 'noise.2d' || s.type === 'noise.fbm')
    const pass = new CompiledGraphPass(plan)
    pass.init(device, FORMAT)
    queue.writeBuffer.mockClear()

    pass.setViewportTransform(1.5, 0, 0)

    expect(queue.writeBuffer).toHaveBeenCalledTimes(noiseSteps.length)
  })

  it('does not call writeBuffer when no noise nodes are in the plan', () => {
    const pass = makeVignettePass() // vignette has no noise nodes
    pass.init(device, FORMAT)
    queue.writeBuffer.mockClear()

    pass.setViewportTransform(2.0, 0.1, -0.1)

    expect(queue.writeBuffer).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// dispose()
// ---------------------------------------------------------------------------

describe('CompiledGraphPass.dispose()', () => {
  it('calls destroy() on all uniform buffers', () => {
    const destroySpy = vi.fn()
    const { device } = createMockDevice()
    ;(device.createBuffer as ReturnType<typeof vi.fn>).mockReturnValue({ destroy: destroySpy })

    const pass = makeVignettePass()
    pass.init(device, FORMAT)
    pass.dispose()

    expect(destroySpy).toHaveBeenCalled()
  })

  it('calls destroy() on the default texture', () => {
    const destroySpy = vi.fn()
    const { device } = createMockDevice()

    let callCount = 0
    ;(device.createTexture as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      return { createView: vi.fn(() => ({})), destroy: callCount === 1 ? destroySpy : vi.fn() }
    })

    const pass = makeVignettePass()
    pass.init(device, FORMAT)
    pass.dispose()

    expect(destroySpy).toHaveBeenCalled()
  })

  it('calling dispose() twice does not throw', () => {
    const { device } = createMockDevice()
    const pass = makeVignettePass()
    pass.init(device, FORMAT)
    pass.dispose()
    expect(() => pass.dispose()).not.toThrow()
  })

  it('updateStepParam() no-ops after dispose()', () => {
    const { device } = createMockDevice()
    const pass = makeVignettePass()
    pass.init(device, FORMAT)
    pass.dispose()

    const [info] = pass.getParamInfo()
    expect(() => pass.updateStepParam(info.stepId, 'strength', 0.5)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// CompiledGraphPlugin
// ---------------------------------------------------------------------------

describe('CompiledGraphPlugin', () => {
  it('exposes .pass as a CompiledGraphPass', () => {
    const plugin = new CompiledGraphPlugin(compile(createVignette()), 'vignette')
    expect(plugin.pass).toBeInstanceOf(CompiledGraphPass)
  })

  it('name matches constructor argument', () => {
    const plugin = new CompiledGraphPlugin(compile(createVignette()), 'my-plugin')
    expect(plugin.name).toBe('my-plugin')
    expect(plugin.pass.name).toBe('my-plugin')
  })

  it('install() calls postProcessing.addPass()', () => {
    const addPass = vi.fn()
    const removePass = vi.fn()
    const mockCanvas = { width: 800, height: 600 } as HTMLCanvasElement

    const plugin = new CompiledGraphPlugin(compile(createVignette()), 'vig')
    plugin.install({
      canvas: mockCanvas,
      services: { get: () => ({ addPass, removePass }) },
    })

    expect(addPass).toHaveBeenCalledWith(plugin.pass)
  })

  it('uninstall() calls postProcessing.removePass()', () => {
    const addPass = vi.fn()
    const removePass = vi.fn()
    const mockCanvas = { width: 800, height: 600 } as HTMLCanvasElement

    const plugin = new CompiledGraphPlugin(compile(createVignette()), 'vig')
    plugin.install({
      canvas: mockCanvas,
      services: { get: () => ({ addPass, removePass }) },
    })
    plugin.uninstall()

    expect(removePass).toHaveBeenCalledWith('vig')
  })

  it('setCanvas() is called on the pass during install', () => {
    const addPass = vi.fn()
    const mockCanvas = { width: 800, height: 600 } as HTMLCanvasElement
    const plugin = new CompiledGraphPlugin(compile(createVignette()), 'vig')
    const setCanvasSpy = vi.spyOn(plugin.pass, 'setCanvas')

    plugin.install({
      canvas: mockCanvas,
      services: { get: () => ({ addPass, removePass: vi.fn() }) },
    })

    expect(setCanvasSpy).toHaveBeenCalledWith(mockCanvas)
  })
})
