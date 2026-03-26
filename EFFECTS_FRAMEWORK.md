# Effects Framework

Compositing framework for procedural post-processing effects on top of the HDR Canvas WebGPU plugin system.

## Architecture

```
EffectGraph (DAG definition)
    ↓  compile()
ExecutionPlan (topologically sorted steps)
    ↓
CompiledGraphPass (PostProcessingPass — WebGPU execution)
    ↓
CompiledGraphPlugin (HDRPlugin wrapper)
```

**Package:** `@dimkatet/effects-graph` (`packages/effects/`)
**Entry points:** `@dimkatet/effects-graph` (graph layer), `@dimkatet/effects-graph/webgpu` (WebGPU adapter)

---

## Graph Layer (`src/`)

### `types.ts`
Primitive value types shared across the graph:
- `NodeId` — branded string (`string & { _brand: 'NodeId' }`)
- `makeNodeId()` — factory for unique IDs
- `Vec2/3/4`, `ColorRGBA`, `GradientStop`
- `ParamValue` — discriminated union of all settable param types
- `OutputType` — `'rgba' | 'scalar' | 'vec2'`
- `Connection` — `{ from: NodeId; to: NodeId; port: string }`

### `nodes/types.ts`
Discriminated union `EffectNode` — 12 variants, each with `type` (literal tag), `outputType`, `inputPorts`, and typed `params`:

| Type tag | Output | Inputs | Key params |
|---|---|---|---|
| `source` | rgba | — | label |
| `noise.2d` | scalar | — | frequency, seed |
| `noise.fbm` | scalar | — | octaves, persistence, lacunarity, seed |
| `geometry.warp` | rgba | image, field | strength |
| `geometry.transform` | rgba | image | scale, rotation, pivot |
| `color.transform` | rgba | image | brightness, contrast, saturation, hue |
| `color.gradientMap` | rgba | luminance | stops |
| `channel.offset` | rgba | image | rOffset, gOffset, bOffset |
| `channel.mix` | rgba | a, b | matrix (4×4) |
| `utility.mix` | rgba | a, b, factor | defaultFactor |
| `utility.mask` | rgba | image, mask | threshold, invert |
| `utility.math` | scalar | a, b | op |

### `graph/Graph.ts` — `EffectGraph`
Container for nodes + connections.

```typescript
const graph = new EffectGraph()
const id = graph.addNode(node)        // returns NodeId
graph.connect(fromId, toId, 'port')
graph.setOutput(nodeId)
graph.removeNode(id)
graph.validate()                       // → { valid, errors }
graph.toJSON() / EffectGraph.fromJSON()
```

Validation: DFS cycle detection + required port check. Serialization via `NODE_FACTORIES` map.

### `graph/compiler.ts` — `compile(graph)`
Transforms `EffectGraph` → `ExecutionPlan` using Kahn's algorithm (topological sort).

```typescript
interface ExecutionStep {
  id: string
  type: string
  params: Record<string, unknown>
  inputs: Record<string, string>   // port → upstream step id
  outputType: string
}

interface ExecutionPlan {
  steps: readonly ExecutionStep[]
  outputId: string
}
```

1 node = 1 step. Queue sorted by insertion index for determinism.

### `presets/analogGlitch.ts` — `createAnalogGlitch(options?)`
Reference preset. Returns a fresh `EffectGraph` with 8 nodes:

```
noise1 (high freq) → warp1 (subtle) ─────────────────→ mix ← output
noise2 (low freq)  → warp2 → channelOffset (RGB shift) ↑
                   → mask (step threshold) ──────────── factor
```

---

## WebGPU Adapter (`src/webgpu/`)

### `shaders.ts`
WGSL shader strings — one per implemented node type:

| Shader | Node | Notes |
|---|---|---|
| `VERTEX_SHADER` | shared | fullscreen quad from `vertex_index` |
| `NOISE_2D_SHADER` | `noise.2d` | value noise; converts canvas UV → image UV via viewport params (zoom, panX, panY) |
| `WARP_SHADER` | `geometry.warp` | horizontal UV displacement by scalar field |
| `MASK_SHADER` | `utility.mask` | `step(threshold, mask.r)` → binary 0/1 |
| `CHANNEL_OFFSET_SHADER` | `channel.offset` | per-channel UV offset (chromatic aberration) |
| `MIX_SHADER` | `utility.mix` | `mix(a, b, factor.r)` with optional default factor |

**Image-space noise:** `noise.2d` uniform buffer carries `zoom/panX/panY` from the viewport. Fragment shader computes `imageUV = (canvasUV - 0.5) / zoom + vec2(panX, panY) + 0.5` before sampling — noise pattern tracks the image through zoom/pan.

### `pipelines.ts`
Pipeline helpers:

**`NODE_SHADER_PORTS`** — maps node type → ordered list of input ports that become texture bindings (binding 2+). Ports absent here (e.g. `utility.mask:image`) have no shader binding.

**`createNodePipeline(device, format, nodeType)`** — builds `GPUBindGroupLayout` (uniform @ 0, sampler @ 1, textures @ 2+) and `GPURenderPipeline`.

**`createUniformBuffer(device, step)`** / `buildUniformData(step)` — creates and fills a `GPUBuffer` from `step.params`. `noise.2d` uses 32 bytes (8×f32) to accommodate viewport fields.

### `CompiledGraphPass` (implements `PostProcessingPass`)
Executes an `ExecutionPlan` as a single post-processing pass. Manages all intermediate `rgba16float` textures internally.

```typescript
class CompiledGraphPass {
  setCanvas(canvas: HTMLCanvasElement): void
  setViewportTransform(zoom: number, panX: number, panY: number): void
  init(device, format): void
  encode(encoder, input, output): void
  dispose(): void
}
```

- `init()` — creates sampler, 1×1 black default texture, per-type pipelines, per-step uniform buffers; collects `noiseStepIds`
- `encode()` — detects canvas resize (destroys/recreates step textures), builds `stepId → GPUTextureView` registry, encodes each step as a fullscreen render pass; output step writes directly to `output`
- `setViewportTransform()` — writes `[zoom, 0, panX, panY]` at byte offset 8 of each `noise.2d` uniform buffer (direct `queue.writeBuffer`, no rebuild)
- Fallback: unconnected optional ports get a 1×1 black default view

### `CompiledGraphPlugin`
Thin `HDRPlugin`-compatible wrapper (structural typing — no import from `@dimkatet/hdr-canvas`).

```typescript
class CompiledGraphPlugin {
  readonly pass: CompiledGraphPass
  install(ctx: MinimalPluginCtx): void
  uninstall(): void
}
```

`install()` calls `pass.setCanvas()` + `postProcessing.addPass()`. `uninstall()` calls `removePass()`.

---

## Example App Integration (`packages/example/`)

**`src/plugins/glitchPlugin.ts` — `GlitchPlugin implements HDRPlugin`**

Wraps `CompiledGraphPlugin(compile(createAnalogGlitch()))` with toggle support:

```typescript
class GlitchPlugin {
  install(ctx): void   // setCanvas, addPass if enabled, subscribe viewport:update
  uninstall(): void    // unsubscribe, removePass
  setEnabled(v): void  // addPass / removePass on the fly
}
```

Subscribes to `viewport:update` in `install()` to forward `state.zoom/panX/panY` → `pass.setViewportTransform()`. Unsubscribes on `uninstall()`.

---

## Param Descriptor System (`src/params.ts`)

Universal metadata layer for UI generation — renderer-agnostic, lives in the graph layer.

### Descriptor types

| Type | Fields |
|---|---|
| `NumberParamDescriptor` | `label, min, max, step, default` |
| `BoolParamDescriptor` | `label, default` |
| `Vec2ParamDescriptor` | `label, min, max, step, default: [x, y]` |
| `SelectParamDescriptor<T>` | `label, options, default` |

```typescript
type ParamDescriptor = NumberParamDescriptor | BoolParamDescriptor | Vec2ParamDescriptor | SelectParamDescriptor
type ParamSchema = Record<string, ParamDescriptor>
```

### `NODE_PARAM_SCHEMAS`

Maps node type → `ParamSchema`. Covers only user-editable params; viewport-managed fields (`noise.2d` zoom/pan) are excluded.

Implemented schemas: `noise.2d`, `geometry.warp`, `utility.mask`, `channel.offset`, `utility.mix`.

### Runtime API on `CompiledGraphPass`

```typescript
// Returns schema + current live values for all steps with user-editable params
pass.getParamInfo(): readonly StepParamInfo[]
// → [{ stepId, nodeType, label?, schema, values }]

// Update one param — rewrites only the uniform buffer, no recompilation
pass.updateStepParam(stepId: string, name: string, value: unknown): void
// Caller must trigger re-render: postProcessing.requestRender()
```

`CompiledGraphPass` maintains a mutable `currentParams` map (copied from plan at `init()`). `updateStepParam` merges the new value, calls `buildUniformData` to rebuild the byte layout, and writes via `queue.writeBuffer` at offset 0.

### Typical UI flow

```typescript
const info = pass.getParamInfo()
// render controls from info[i].schema entries

// on user input:
pass.updateStepParam(info[i].stepId, 'strength', 0.2)
postProcessing.requestRender()
```

---

## Implemented vs Defined

Nodes defined in the type system but **not yet backed by a shader/pipeline**: `noise.fbm`, `geometry.transform`, `color.transform`, `color.gradientMap`, `channel.mix`, `utility.math`. Adding a node requires: shader string in `shaders.ts`, case in `createNodePipeline()` and `buildUniformData()`, entry in `NODE_SHADER_PORTS`.
