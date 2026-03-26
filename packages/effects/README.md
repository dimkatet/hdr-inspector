# @dimkatet/effects-graph

Compositing effect graph — define procedural image effects as a DAG, compile to an execution plan, execute on WebGPU.

## Packages

| Entry point | Contents |
|---|---|
| `@dimkatet/effects-graph` | Graph definition, compiler, presets, param descriptors |
| `@dimkatet/effects-graph/webgpu` | WebGPU adapter (`CompiledGraphPass`, `CompiledGraphPlugin`) |

---

## Graph Layer

### Define a graph

```typescript
import { EffectGraph, compile } from '@dimkatet/effects-graph'

const g = new EffectGraph()

const source = g.addNode({ type: 'source', outputType: 'rgba', inputPorts: [], params: {} })
const noise  = g.addNode({ type: 'noise.2d', outputType: 'scalar', inputPorts: [], params: { frequency: 4.0, seed: 0, noiseType: 'perlin' } })
const warp   = g.addNode({ type: 'geometry.warp', outputType: 'rgba', inputPorts: ['image', 'field'], params: { strength: 0.05 } })

g.connect(source, warp, 'image')
g.connect(noise,  warp, 'field')
g.setOutput(warp)

const plan = compile(g)  // ExecutionPlan — topologically sorted steps
```

### Validate and serialize

```typescript
const { valid, errors } = g.validate()

const json = g.toJSON()
const g2   = EffectGraph.fromJSON(json)
```

### Node types

| Type | Output | Input ports | Key params |
|---|---|---|---|
| `source` | rgba | — | — |
| `noise.2d` | scalar | — | `frequency`, `seed` |
| `noise.fbm` | scalar | — | `octaves`, `persistence`, `lacunarity`, `seed` |
| `geometry.warp` | rgba | `image`, `field` | `strength` |
| `geometry.transform` | rgba | `image` | `scale`, `rotation`, `pivot` |
| `color.transform` | rgba | `image` | `brightness`, `contrast`, `saturation`, `hue` |
| `color.gradientMap` | rgba | `luminance` | `stops` |
| `channel.offset` | rgba | `image` | `rOffset`, `gOffset`, `bOffset` |
| `channel.mix` | rgba | `a`, `b` | `matrix` (4×4) |
| `utility.mix` | rgba | `a`, `b`, `factor` | `defaultFactor` |
| `utility.mask` | rgba | `image`, `mask` | `threshold`, `invert` |
| `utility.math` | scalar | `a`, `b` | `op` |

> **Note:** Only `noise.2d`, `geometry.warp`, `utility.mask`, `channel.offset`, and `utility.mix` have WebGPU shader implementations. Other types are defined in the type system for future implementation.

---

## Presets

```typescript
import { createAnalogGlitch } from '@dimkatet/effects-graph'

// Returns a ready-to-compile EffectGraph
const g = createAnalogGlitch({
  highFreq: 12.0,       // noise frequency for subtle warp
  lowFreq: 2.0,         // noise frequency for mask + large shift
  subtleStrength: 0.02, // warp strength for initial distortion
  largeStrength: 0.15,  // warp strength for glitch shift
  threshold: 0.5,       // mask threshold
  rOffset: [0.005, 0],  // chromatic aberration per channel
  gOffset: [0, 0],
  bOffset: [-0.005, 0],
  seed1: 42,
  seed2: 137,
})
```

Graph structure:
```
noise1 (high freq) → warp (subtle) ──────────────── mix → output
noise2 (low freq)  → shifted (large) → channelOffset ↑
                   → mask ─────────────────────── factor
```

---

## WebGPU Adapter

Plug a compiled graph into the [hdr-image-renderer](../hdr-image-renderer) post-processing pipeline.

### As a plugin

```typescript
import { compile, createAnalogGlitch } from '@dimkatet/effects-graph'
import { CompiledGraphPlugin } from '@dimkatet/effects-graph/webgpu'
import type { HDRPlugin, PluginContext } from '@dimkatet/hdr-image-renderer'

const plugin = new CompiledGraphPlugin(compile(createAnalogGlitch()), 'glitch')

// Register with HDRCanvas
canvas.use({
  name: 'glitch-wrapper',
  install(ctx: PluginContext) {
    plugin.pass.setCanvas(ctx.canvas)
    plugin.install(ctx)

    // Keep noise in image-space through zoom/pan
    ctx.events.on('viewport:update', ({ state }) => {
      plugin.pass.setViewportTransform(state.zoom, state.panX, state.panY)
    })
  },
  uninstall() { plugin.uninstall() },
})
```

### Live param updates

```typescript
import { NODE_PARAM_SCHEMAS } from '@dimkatet/effects-graph'
import type { CompiledGraphPass } from '@dimkatet/effects-graph/webgpu'

const pass: CompiledGraphPass = plugin.pass

// Discover all user-editable params with UI metadata
const info = pass.getParamInfo()
// → [{ stepId, nodeType, label?, schema, values }]

// Each schema entry is a ParamDescriptor:
// { type: 'number', label, min, max, step, default }
// { type: 'boolean', label, default }
// { type: 'vec2', label, min, max, step, default: [x, y] }
// { type: 'select', label, options, default }

// Update a param — rewrites only the uniform buffer, no recompilation
pass.updateStepParam(info[0].stepId, 'frequency', 8.0)
postProcessing.requestRender()
```

---

## Extending with a new node

1. **Add type definition** in `src/nodes/types.ts` — extend `EffectNode` union
2. **Add factory** in `src/graph/Graph.ts` — `NODE_FACTORIES` map
3. **Write WGSL shader** in `src/webgpu/shaders.ts`
4. **Register pipeline** in `src/webgpu/pipelines.ts` — `createNodePipeline()`, `buildUniformData()`, `NODE_SHADER_PORTS`
5. **Add param schema** in `src/params.ts` — `NODE_PARAM_SCHEMAS`

---

## Image-space noise

`noise.2d` generates noise in image-space rather than canvas-space, so the pattern tracks the image through zoom and pan. This requires forwarding the viewport transform whenever it changes:

```typescript
ctx.events.on('viewport:update', ({ state }) => {
  pass.setViewportTransform(state.zoom, state.panX, state.panY)
})
```

Without this, the noise field stays fixed in screen-space and appears to slide over the image during pan/zoom.
