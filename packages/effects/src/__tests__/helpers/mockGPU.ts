import { vi } from 'vitest'

/**
 * Creates a minimal GPUDevice mock sufficient to run CompiledGraphPass.init().
 * All methods return structurally correct objects (pipelines, buffers, textures)
 * without doing any actual GPU work.
 */
export function createMockDevice() {
  const makePassEncoder = () => ({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  })

  const makeEncoder = () => ({
    beginRenderPass: vi.fn(makePassEncoder),
    finish: vi.fn(() => ({})),
  })

  const makeBuffer = () => ({ destroy: vi.fn() })
  const makeView = () => ({})
  const makeTexture = () => ({
    createView: vi.fn(makeView),
    destroy: vi.fn(),
  })

  const queue = {
    writeBuffer: vi.fn(),
    submit: vi.fn(),
  }

  const device = {
    createSampler: vi.fn(() => ({})),
    createTexture: vi.fn(makeTexture),
    createBuffer: vi.fn(makeBuffer),
    createShaderModule: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    createCommandEncoder: vi.fn(makeEncoder),
    queue,
  } as unknown as GPUDevice

  return { device, queue }
}
