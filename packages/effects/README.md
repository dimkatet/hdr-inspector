# @dimkatet/effects-graph

DAG-based compositing system for procedural image effects. Define an effect as a graph of typed nodes, compile it to an execution plan, and run it on WebGPU as a post-processing pass inside `@dimkatet/hdr-image-renderer`.

## Entry points

| Import | Contents |
|---|---|
| `@dimkatet/effects-graph` | Graph, compiler, node types, presets, param descriptors |
| `@dimkatet/effects-graph/webgpu` | `CompiledGraphPass`, `CompiledGraphPlugin` — WebGPU execution |

---

## Architecture overview

```
EffectGraph (DAG definition)
    ↓  compile()
ExecutionPlan (topologically sorted steps)
    ↓
CompiledGraphPass (WebGPU execution engine)
    ↓
CompiledGraphPlugin (HDRPlugin wrapper)
```

Each node in the graph is an atomic GPU operation. Edges carry texture data. The compiler runs Kahn's topological sort and the WebGPU adapter executes steps in dependency order, writing each intermediate result to an `rgba16float` texture.

---

## Quick start

```typescript
import { EffectGraph, compile } from '@dimkatet/effects-graph'
import { CompiledGraphPlugin } from '@dimkatet/effects-graph/webgpu'

const g = new EffectGraph()

const source = g.addNode({ type: 'source',        outputType: 'rgba',   inputPorts: [],               params: {} })
const noise  = g.addNode({ type: 'noise.2d',      outputType: 'scalar', inputPorts: [],               params: { frequency: 4.0, seed: 0, sampleDomain: 'uv' } })
const warp   = g.addNode({ type: 'geometry.warp', outputType: 'rgba',   inputPorts: ['image','field'], params: { strength: 0.05, strengthY: 0.05 } })

g.connect(source, warp, 'image')
g.connect(noise,  warp, 'field')
g.setOutput(warp)

const plan   = compile(g)
const plugin = new CompiledGraphPlugin(plan, 'my-warp')

canvas.use({
  name: 'my-warp-wrapper',
  install(ctx) {
    plugin.pass.setCanvas(ctx.canvas)
    plugin.install(ctx)
    ctx.events.on('viewport:update', ({ state }) => {
      plugin.pass.setViewportTransform(state.zoom, state.panX, state.panY)
    })
  },
  uninstall() { plugin.uninstall() },
})
```

---

## Node types

Every node object must have four fields:

```typescript
{
  type: NodeTypeTag           // discriminates the union
  outputType: 'rgba' | 'scalar'
  inputPorts: readonly string[]
  params: { ... }             // node-specific
}
```

### Source

```typescript
{ type: 'source', outputType: 'rgba', inputPorts: [], params: {} }
```

Injects the renderer output (the HDR image) into the graph. Every graph must have exactly one source node.

---

### noise.2d

```typescript
{
  type: 'noise.2d',
  outputType: 'scalar',
  inputPorts: [],
  params: {
    frequency: number       // spatial scale (default 4.0)
    seed: number            // noise seed (0–100)
    sampleDomain: 'uv' | 'line'
  }
}
```

Generates Perlin gradient noise.

**`sampleDomain: 'uv'`** — standard 2D noise, samples at image UV position.

**`sampleDomain: 'line'`** — scanline-aware mode. The X coordinate is fixed to a seed-derived constant; only Y varies. Produces horizontal bands that are uniform within each row — the VHS/tape look. Essential for `analogVHS` and `neonSignal` presets.

In both modes, noise is evaluated in **image-space** (not canvas-space) so the pattern tracks the image through zoom and pan. This requires forwarding the viewport transform — see [Viewport transform](#viewport-transform).

---

### noise.fbm

```typescript
{
  type: 'noise.fbm',
  outputType: 'scalar',
  inputPorts: [],
  params: {
    frequency: number     // base spatial scale
    octaves: number       // layers of detail (1–8)
    persistence: number   // amplitude decay per octave (0–1)
    lacunarity: number    // frequency multiplier per octave (default 2.0)
    seed: number
  }
}
```

Fractional Brownian Motion — multi-octave Perlin noise. Produces fractal, cloud-like fields.

---

### geometry.warp

```typescript
{
  type: 'geometry.warp',
  outputType: 'rgba',
  inputPorts: ['image', 'field'],
  params: {
    strength: number    // horizontal UV displacement amplitude
    strengthY: number   // vertical UV displacement amplitude
  }
}
```

Displaces the image UV by a scalar field. The field value (0–1) is remapped to (-1, +1) before multiplication by strength. Both `strength` and `strengthY` are in UV units (0.1 = 10% of image width/height).

---

### geometry.domainWarp

```typescript
{
  type: 'geometry.domainWarp',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: {
    frequency: number    // FBM spatial scale
    strength1: number    // first warp pass amplitude
    strength2: number    // second warp pass amplitude
    octaves: number      // FBM octaves
    persistence: number  // FBM persistence
    seed: number
  }
}
```

Two-pass domain warping using FBM vector fields. The image UV is warped twice:

```
flow1 = fbm(uv × freq)           // first FBM vector field
uv1  = uv + flow1 × strength1
flow2 = fbm(uv1 × freq)          // second FBM evaluated at already-warped UV
uv2  = uv1 + flow2 × strength2
```

Produces fluid, coherent distortion with fractal detail. Much more organic than single-pass warp.

---

### geometry.blockWarp

```typescript
{
  type: 'geometry.blockWarp',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: {
    strengthX: number   // max horizontal block shift (UV units)
    strengthY: number   // max vertical block shift (UV units)
    seed: number
  }
}
```

Divides the image into a 12×12 grid and randomly displaces ~30% of blocks. Each block gets a hash-derived random offset. Produces the blocky digital glitch look.

---

### color.transform

```typescript
{
  type: 'color.transform',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: {
    brightness: number   // additive offset (−1 to +1, default 0)
    contrast: number     // scale around 0.5 (default 1.0)
    saturation: number   // 0 = grayscale, 1 = original, >1 = vivid
    hue: number          // rotation in radians
  }
}
```

Standard color grading. Operations are applied in order: brightness → contrast → saturation → hue rotation.

Hue rotation uses a 3×3 rotation matrix in RGB space (Euler rotation, not HSV conversion).

---

### color.gradientMap

```typescript
{
  type: 'color.gradientMap',
  outputType: 'rgba',
  inputPorts: ['luminance'],
  params: {
    stops: Array<{ color: [r, g, b], pos: number }>  // up to 8 stops, pos in [0,1]
  }
}
```

Maps luminance to a color gradient. The `luminance` input is a scalar texture (e.g. from `utility.lumaMask` or noise). Stops are linearly interpolated; positions do not need to be sorted (sorted at build time).

BT.709 luma weights are used if the `luminance` input is rgba: `Y = 0.2126·R + 0.7152·G + 0.0722·B`.

---

### channel.offset

```typescript
{
  type: 'channel.offset',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: {
    rOffset: [number, number]   // [x, y] UV offset for red channel
    gOffset: [number, number]   // [x, y] UV offset for green channel
    bOffset: [number, number]   // [x, y] UV offset for blue channel
  }
}
```

Samples each color channel at a different UV offset — chromatic aberration. Values are UV units (0.01 = 1% of image width).

Typical values:
```typescript
rOffset: [ 0.005, 0],
gOffset: [ 0,     0],
bOffset: [-0.005, 0],
```

---

### utility.mix

```typescript
{
  type: 'utility.mix',
  outputType: 'rgba',
  inputPorts: ['a', 'b', 'factor'],   // 'factor' is optional
  params: {
    defaultFactor: number   // fallback when 'factor' port is unconnected (0–1)
  }
}
```

Linear interpolation: `result = mix(a, b, factor)`. When the `factor` port is connected, it uses the scalar texture as a per-pixel blend weight. When unconnected, uses `defaultFactor` uniformly.

---

### utility.mask

```typescript
{
  type: 'utility.mask',
  outputType: 'rgba',
  inputPorts: ['image', 'mask'],
  params: {
    threshold: number   // step threshold (0–1)
    invert: boolean
  }
}
```

Applies a binary mask to the image using a step function on the mask's red channel. Pixels where `mask.r < threshold` are zeroed (or the inverse when `invert: true`).

---

### utility.math

```typescript
{
  type: 'utility.math',
  outputType: 'scalar',
  inputPorts: ['a', 'b'],
  params: {
    op: 'add' | 'subtract' | 'multiply' | 'step' | 'clamp'
  }
}
```

Per-pixel scalar arithmetic. Useful for combining noise fields before feeding into a warp or mask node.

---

### utility.blend

```typescript
{
  type: 'utility.blend',
  outputType: 'rgba',
  inputPorts: ['a', 'b'],
  params: {
    mode: 'add' | 'multiply' | 'screen' | 'overlay'
    intensity: number   // blend strength (0–1)
  }
}
```

Photoshop-style layer blend modes. `a` is the base layer, `b` is the blend layer.

| Mode | Formula |
|---|---|
| `add` | `a + b × intensity` |
| `multiply` | `a × mix(1, b, intensity)` |
| `screen` | `1 − (1−a)(1−b)`, scaled by intensity |
| `overlay` | Per-channel: multiply if base < 0.5, screen otherwise |

---

### utility.lumaMask

```typescript
{
  type: 'utility.lumaMask',
  outputType: 'scalar',
  inputPorts: ['image'],
  params: {
    low: number    // smoothstep lower edge (0–1)
    high: number   // smoothstep upper edge (0–1)
  }
}
```

Converts an rgba image to a scalar luminance mask using `smoothstep(low, high, luma)`. The output is 0 in shadows and 1 in highlights (or the reverse if `high < low`).

Common use: feed into `utility.mix.factor` to blend two color grades by brightness region.

---

### utility.pixelate

```typescript
{
  type: 'utility.pixelate',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: {
    blockSize: number   // pixel block size in pixels (1–64)
  }
}
```

Quantizes the image to a block grid. Each block takes the color of its top-left corner pixel (nearest-neighbor at block centers).

---

### effect.vignette

```typescript
{
  type: 'effect.vignette',
  outputType: 'rgba',
  inputPorts: ['image'],
  params: {
    strength: number       // darkening amount (0–1)
    innerRadius: number    // start of falloff (0–1, default 0.5)
    outerRadius: number    // full black at this radius (0–1, default 1.0)
  }
}
```

Radial darkening from the center. Uses `smoothstep(innerRadius, outerRadius, dist)` for soft falloff.

---

## Presets

Presets are factory functions that return a ready-to-compile `EffectGraph`. All parameters have sensible defaults and can be partially overridden.

```typescript
import {
  createAnalogGlitch,
  createAnalogVHS,
  createNeonSignal,
  createDataGlitch,
  createLiquidGlitch,
  createCyberpunk,
  createFilmGrain,
  createDuotone,
  createVignette,
} from '@dimkatet/effects-graph'
import { compile } from '@dimkatet/effects-graph'

const plan = compile(createAnalogGlitch({ largeStrength: 0.2 }))
```

### analogGlitch

Analog signal corruption. Two-level warp (subtle + large) masked by low-frequency noise, with chromatic aberration on the large-shift regions.

```
noise1 (high freq) → warp (subtle) ──────────────── mix → output
noise2 (low freq)  → warp (large) → channelOffset  ↑
                   → mask ──────────────── factor ──┘
```

Options:

```typescript
interface AnalogGlitchOptions {
  highFreq: number        // default 12 — subtle warp noise frequency
  lowFreq: number         // default 2 — mask + large warp noise frequency
  subtleStrength: number  // default 0.02
  largeStrength: number   // default 0.15
  threshold: number       // default 0.5 — mask step threshold
  rOffset: [number, number]  // default [0.005, 0]
  gOffset: [number, number]  // default [0, 0]
  bOffset: [number, number]  // default [-0.005, 0]
  seed1: number           // default 42
  seed2: number           // default 137
}
```

---

### analogVHS

Full VHS tape effect: scanline warp, periodic line tearing, chromatic aberration, film grain, color fade.

```
noiseHi (16Hz, line) → warpScanline
noiseLo (1.5Hz, line) → warpTear
                      → tearMask → mix(scanline, tear)
                                       ↓
                               channelOffset → blend(grain, add) → colorTransform → output
```

The key is `sampleDomain: 'line'` on both noise nodes — noise is constant within each scanline, producing horizontal distortion bands.

Options:

```typescript
interface AnalogVHSOptions {
  scanlineFreq: number    // default 16
  scanlineStrength: number // default 0.008
  tearFreq: number        // default 1.5
  tearStrength: number    // default 0.12
  tearThreshold: number   // default 0.82 — only top 18% of noise tears
  grainFreq: number       // default 48
  grainIntensity: number  // default 0.04
  saturation: number      // default 0.75
  contrast: number        // default 1.1
  brightness: number      // default -0.03
}
```

---

### neonSignal

Scanline-modulated neon color grading. Blends a cool base grade and a vivid neon grade by luminance, then modulates the blend factor with a scanline noise field.

```
source → domainWarp → channelOffset → colorBase ──┐
                                    → colorNeon ──→ mix (lumaMask driven)
source → lumaMask ──────────────────────────────── factor
                                                    ↓
                                    mix(result, scanlineNoise) → output
```

Options:

```typescript
interface NeonSignalOptions {
  warpStrength: number         // default 0.015
  rOffset: [number, number]    // default [0.003, 0]
  bOffset: [number, number]    // default [-0.003, 0]
  scanlineFreq: number         // default 8
  scanlineBlend: number        // default 0.08
  maskLow: number              // default 0.2
  maskHigh: number             // default 0.6
  baseSaturation: number       // default 0.6
  neonContrast: number         // default 1.6
  neonSaturation: number       // default 1.8
  neonHue: number              // default 0.5 (magenta tilt)
}
```

---

### dataGlitch

Pixelated block-displacement glitch. Applies pixelation and block warp, then masks the glitched version over the original using a noise-driven luma mask.

```
source → pixelate → blockWarp → channelOffset → colorGrade ─┐
noise.2d → lumaMask ──────────────────────── factor          │
source ──────────────────────────────────── a ───→ mix ──────┘→ output
```

Options:

```typescript
interface DataGlitchOptions {
  blockSize: number           // default 16
  blockWarpStrengthX: number  // default 0.12
  blockWarpStrengthY: number  // default 0.06
  noiseFreq: number           // default 20
  maskLow: number             // default 0.4
  maskHigh: number            // default 0.8
  seed: number                // default 7
}
```

---

### liquidGlitch

Fluid domain-warped distortion with chromatic aberration, blended over the original.

```
source → domainWarp (2-pass FBM) → channelOffset → mix(source, distorted) → output
```

Options:

```typescript
interface LiquidGlitchOptions {
  frequency: number    // default 2
  strength1: number    // default 0.04
  strength2: number    // default 0.08
  octaves: number      // default 3
  persistence: number  // default 0.5
  mixFactor: number    // default 0.7
}
```

---

### cyberpunk

Selective neon grading driven by luminance. Shadows stay desaturated; highlights are mapped through a neon gradient (purple → pink → cyan) with chromatic aberration.

```
source → colorBase ────────────────────── mix(base, neon, lumaMask)
source → colorNeon → gradientMap(neon) ──┘
source → lumaMask ─────────────── factor
                                    ↓
                              channelOffset → output
```

Options:

```typescript
interface CyberpunkOptions {
  maskLow: number           // default 0.3
  maskHigh: number          // default 0.7
  baseSaturation: number    // default 0.3
  neonSaturation: number    // default 2.0
  neonContrast: number      // default 1.5
  rOffset: [number, number] // default [0.004, 0]
  bOffset: [number, number] // default [-0.004, 0]
}
```

---

### filmGrain

Simple high-frequency noise blended additively over the image.

```
source ──────────────── a ──┐
noise.2d (high freq) ─── b ──→ blend(add) → output
```

Options:

```typescript
interface FilmGrainOptions {
  frequency: number    // default 60
  intensity: number    // default 0.05
  seed: number         // default 0
}
```

---

### duotone

Maps luminance to a two-color gradient (shadows → highlights).

```
source → gradientMap([shadowColor, highlightColor]) → output
```

Options:

```typescript
interface DuotoneOptions {
  shadowColor: [r: number, g: number, b: number]     // default [0.05, 0.02, 0.15] (deep purple)
  highlightColor: [r: number, g: number, b: number]  // default [1.0, 0.4, 0.1]   (warm orange)
}
```

---

### vignette

Radial darkening from center to edges.

```
effect.vignette(source) → output
```

Options:

```typescript
interface VignetteOptions {
  strength: number      // default 0.8
  innerRadius: number   // default 0.4
  outerRadius: number   // default 1.1
}
```

---

## WebGPU adapter

### CompiledGraphPass

The core execution engine. Implements the `PostProcessingPass` interface expected by `@dimkatet/hdr-image-renderer`.

```typescript
import { compile, createAnalogGlitch } from '@dimkatet/effects-graph'
import { CompiledGraphPass } from '@dimkatet/effects-graph/webgpu'

const pass = new CompiledGraphPass(compile(createAnalogGlitch()), 'glitch')

// Required before init()
pass.setCanvas(canvasElement)

// Called automatically by PostProcessingChain
pass.init(device, format)
pass.encode(encoder, inputView, outputView)
pass.dispose()
```

### CompiledGraphPlugin

Thin `HDRPlugin` wrapper. Manages `addPass` / `removePass` on the post-processing chain.

```typescript
import { CompiledGraphPlugin } from '@dimkatet/effects-graph/webgpu'

const plugin = new CompiledGraphPlugin(plan, 'glitch')

canvas.use({
  name: 'glitch-wrapper',
  install(ctx) {
    plugin.pass.setCanvas(ctx.canvas)
    plugin.install(ctx)

    ctx.events.on('viewport:update', ({ state }) => {
      plugin.pass.setViewportTransform(state.zoom, state.panX, state.panY)
    })
  },
  uninstall() { plugin.uninstall() },
})
```

---

## Viewport transform

`noise.2d` nodes sample noise in image-space so the pattern stays attached to the image through zoom and pan. This requires calling `setViewportTransform` whenever the viewport changes:

```typescript
ctx.events.on('viewport:update', ({ state }) => {
  pass.setViewportTransform(state.zoom, state.panX, state.panY)
})
```

Without this, noise stays fixed in screen-space and visibly slides over the image during pan/zoom.

The update rewrites 16 bytes in each noise node's uniform buffer — no pipeline rebuild.

---

## Live param updates

Params can be updated after `init()` with no recompilation:

```typescript
// Discover all editable params with UI metadata
const info = pass.getParamInfo()
// → StepParamInfo[]

interface StepParamInfo {
  stepId: string
  nodeType: string
  label?: string
  schema: ParamSchema      // { paramName: ParamDescriptor, ... }
  values: Record<string, unknown>
}

// ParamDescriptor variants:
// { type: 'number',  label, min, max, step, default }
// { type: 'boolean', label, default }
// { type: 'vec2',    label, min, max, step, default: [x, y] }
// { type: 'select',  label, options: string[], default }

// Update a param — only rewrites the uniform buffer
pass.updateStepParam(info[0].stepId, 'frequency', 8.0)

// Trigger a re-render (if postProcessing.requestRender() is not called elsewhere)
postProcessing.requestRender()
```

`NODE_PARAM_SCHEMAS` exports the schema definitions for all node types, useful for building generic param UIs:

```typescript
import { NODE_PARAM_SCHEMAS } from '@dimkatet/effects-graph'

const schema = NODE_PARAM_SCHEMAS['noise.2d']
// → { frequency: { type: 'number', min: 0.5, max: 32, ... }, seed: ..., sampleDomain: ... }
```

---

## Serialization

```typescript
// Serialize
const json = graph.toJSON()         // EffectGraphData (plain object, JSON-safe)
localStorage.setItem('g', JSON.stringify(json))

// Deserialize
const json2  = JSON.parse(localStorage.getItem('g')!)
const graph2 = EffectGraph.fromJSON(json2)
const plan2  = compile(graph2)
```

---

## Validation

```typescript
const result = graph.validate()

if (!result.valid) {
  for (const err of result.errors) {
    // err.kind: 'cycle' | 'missing-required-input' | 'no-output'
    console.error(err.message)
  }
}
```

`compile()` calls `validate()` internally and throws `CompileError` on failure.

---

## Building custom effects

### Compose existing nodes

```typescript
import { EffectGraph, compile } from '@dimkatet/effects-graph'

function createMyEffect() {
  const g = new EffectGraph()

  const src   = g.addNode({ type: 'source',           outputType: 'rgba',   inputPorts: [],               params: {} })
  const px    = g.addNode({ type: 'utility.pixelate', outputType: 'rgba',   inputPorts: ['image'],        params: { blockSize: 12 } })
  const grade = g.addNode({ type: 'color.transform',  outputType: 'rgba',   inputPorts: ['image'],        params: { saturation: 1.8, contrast: 1.4, brightness: 0, hue: 0.3 } })
  const mask  = g.addNode({ type: 'utility.lumaMask', outputType: 'scalar', inputPorts: ['image'],        params: { low: 0.3, high: 0.7 } })
  const mix   = g.addNode({ type: 'utility.mix',      outputType: 'rgba',   inputPorts: ['a','b','factor'], params: { defaultFactor: 0.5 } })

  g.connect(src,   px,    'image')
  g.connect(px,    grade, 'image')
  g.connect(src,   mix,   'a')
  g.connect(grade, mix,   'b')
  g.connect(src,   mask,  'image')
  g.connect(mask,  mix,   'factor')  // blend by brightness
  g.setOutput(mix)

  return g
}
```

### Add a new node type

Follow these five steps when the built-in nodes are not enough:

**1. Add type** in `src/nodes/types.ts`:
```typescript
export interface MyParams {
  readonly strength: number
}

export interface MyNode extends NodeBase {
  readonly type: 'namespace.myNode'
  readonly outputType: 'rgba'
  readonly inputPorts: readonly ['image']
  readonly params: MyParams
}

export type EffectNode = ... | MyNode
```

**2. Add factory** in `src/graph/Graph.ts` (`NODE_FACTORIES`):
```typescript
['namespace.myNode', (p) => ({
  type: 'namespace.myNode',
  outputType: 'rgba',
  inputPorts: ['image'] as const,
  params: p as unknown as MyParams,
})],
```

**3. Write WGSL shader** in `src/webgpu/shaders.ts`:
```wgsl
struct MyParams { strength: f32, _pad: f32, }

@group(0) @binding(0) var<uniform> params: MyParams;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var imageTex: texture_2d<f32>;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let c = textureSample(imageTex, samp, in.uv);
  return vec4f(c.rgb * params.strength, c.a);
}
```

Prepend `VERTEX_SHADER` to produce the full shader string.

**4. Register pipeline** in `src/webgpu/pipelines.ts`:
```typescript
// NODE_SHADER_PORTS
'namespace.myNode': ['image'],

// createNodePipeline() switch
case 'namespace.myNode':
  return buildPipeline(device, format, VERTEX_SHADER + MY_FRAGMENT, 1)

// buildUniformData() switch
case 'namespace.myNode': {
  const buf = new Float32Array(2)
  buf[0] = (params.strength as number) ?? 1.0
  return buf.buffer
}
```

**5. Add param schema** in `src/params.ts`:
```typescript
'namespace.myNode': {
  strength: { type: 'number', label: 'Strength', min: 0, max: 2, step: 0.01, default: 1.0 },
}
```

---

## Node implementation status

| Node | Shader | Notes |
|---|---|---|
| `source` | ✓ | |
| `noise.2d` | ✓ | image-space + scanline mode |
| `noise.fbm` | ✓ | |
| `geometry.warp` | ✓ | scalar field → UV displacement |
| `geometry.domainWarp` | ✓ | two-pass FBM |
| `geometry.blockWarp` | ✓ | sparse block displacement |
| `geometry.transform` | — | type defined, shader pending |
| `color.transform` | ✓ | brightness, contrast, saturation, hue |
| `color.gradientMap` | ✓ | up to 8 stops |
| `channel.offset` | ✓ | chromatic aberration |
| `channel.mix` | — | type defined, shader pending |
| `utility.mix` | ✓ | optional per-pixel factor |
| `utility.mask` | ✓ | step threshold |
| `utility.math` | ✓ | add, subtract, multiply, step, clamp |
| `utility.blend` | ✓ | add, multiply, screen, overlay |
| `utility.lumaMask` | ✓ | smoothstep luminance mask |
| `utility.pixelate` | ✓ | block grid quantization |
| `effect.vignette` | ✓ | radial darkening |
