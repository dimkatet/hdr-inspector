# @dimkatet/hdr-image-renderer

WebGPU-based HDR image renderer with native HDR display support, plugin system, and React integration.

## Features

- **Native HDR rendering** with WebGPU (rgba16float + extended tone mapping)
- **Tone mapping** operators — None, Reinhard, ACES
- **Color space support** — sRGB, Display P3, Rec.2020
- **Visualization modes** — RGB, Luminance false-color, Clipping overlay
- **Zoom & pan** with smooth animation, pinch-to-zoom, keyboard navigation
- **Object-fit** — contain, cover, fill, none, scale-down
- **Plugin system** — extend rendering, input, and export without forking
- **Swappable backends** — provide your own renderer (WebGL, WASM, etc.)
- **Async image loading** with placeholder and error fallback support
- **Image export** — PNG/JPEG/custom via pixel readback
- **React component** with composable hooks and imperative ref API
- **Zero hard dependencies** (React is an optional peer dependency)
- **Tree-shakeable** ESM only

## Installation

```bash
npm install @dimkatet/hdr-image-renderer
pnpm add @dimkatet/hdr-image-renderer
```

## Browser Requirements

- **Chrome/Edge 113+** — Full WebGPU + HDR
- **Safari 18+** — WebGPU, partial HDR canvas
- **Firefox Nightly** — Experimental WebGPU only

---

## Usage

### Vanilla JavaScript

```typescript
import { HDRCanvas } from '@dimkatet/hdr-image-renderer'

const canvas = document.querySelector('canvas')!
const hdr = new HDRCanvas(canvas, {
  hdrMode: true,
  exposure: 0,
  toneMapping: 'aces',
  colorSpace: 'display-p3',
})

await hdr.initialize()

// Load image (bring your own decoder — library is format-agnostic)
const buffer = await fetch('photo.hdr').then(r => r.arrayBuffer())
const imageData = myRadianceHDRDecoder(buffer) // → LinearImageData
await hdr.loading.upload(imageData)

// Render settings
hdr.render.setExposure(1.5)
hdr.render.setToneMapping('aces')
hdr.render.setHDRMode(true)
hdr.render.setColorSpace('display-p3')

// Viewport
hdr.viewport.zoomIn(2)
hdr.viewport.zoomOut()
hdr.viewport.zoomToFit()
hdr.viewport.zoomToActual()
hdr.viewport.reset()

// Interactions
const detach = hdr.interaction.attach({
  wheel: true,
  drag: true,
  touch: true,
  keyboard: true,
  minZoom: 0.1,
  maxZoom: 20,
})

// Canvas auto-resize
hdr.control.enableAutoResize()

// Events
hdr.on('viewport:update', ({ state }) => console.log('Zoom:', state.zoom))
hdr.on('render:complete', () => console.log('Frame rendered'))

// Export
const blob = await hdr.export.toBlob({ format: 'image/png' })

// Cleanup
detach()
hdr.destroy()
```

### React

```tsx
import { HDRImage, type HDRImageHandle } from '@dimkatet/hdr-image-renderer/react'
import { useRef, useState } from 'react'

function App() {
  const ref = useRef<HDRImageHandle>(null)
  const [zoom, setZoom] = useState(1)
  const [imageData, setImageData] = useState<ImageData | null>(null)

  const handleFile = async (file: File) => {
    const buffer = await file.arrayBuffer()
    setImageData(myDecoder(buffer))
  }

  return (
    <HDRImage
      ref={ref}
      image={imageData}
      options={{
        hdrMode: true,
        exposure: 0,
        toneMapping: 'aces',
        colorSpace: 'display-p3',
      }}
      interactions={{
        wheel: true,
        drag: true,
        touch: true,
        keyboard: true,
        minZoom: 0.1,
        maxZoom: 20,
      }}
      onZoom={(z) => setZoom(z)}
      onLoad={(info) => console.log(info.width, info.height)}
      onError={(err) => console.error(err)}
      fitToImage
    />
  )
}

// Imperative control via ref
ref.current?.zoomIn()
ref.current?.zoomToFit()
ref.current?.resetViewport()
ref.current?.getViewport()  // { zoom, panX, panY }
```

---

## API Reference

### `HDRCanvas`

Main facade class. Uses a namespaced API for better discoverability.

```typescript
const hdr = new HDRCanvas(canvas, options)
await hdr.initialize()
hdr.destroy()
```

#### `HDRCanvasOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `hdrMode` | `boolean` | `false` | Enable native HDR output |
| `exposure` | `number` | `0` | Exposure in EV stops |
| `toneMapping` | `'none' \| 'reinhard' \| 'aces'` | `'aces'` | Tone mapping operator |
| `colorSpace` | `'srgb' \| 'display-p3' \| 'rec2020'` | `'srgb'` | Output color space |
| `visualizationMode` | `'rgb' \| 'luminance' \| 'clipping'` | `'rgb'` | Visualization mode |
| `objectFit` | `'contain' \| 'cover' \| 'fill' \| 'none' \| 'scale-down'` | `'contain'` | Image layout |
| `transparent` | `boolean` | `false` | Transparent canvas background |
| `debug` | `boolean` | `false` | Enable debug logging |
| `renderer` | `RendererService` | WebGPU | Custom rendering backend |

#### `canvas.render` — Render Settings

```typescript
hdr.render.getState()                    // RenderState
hdr.render.setExposure(ev)
hdr.render.setToneMapping(operator)
hdr.render.setHDRMode(enabled)
hdr.render.setColorSpace(space)
hdr.render.setVisualizationMode(mode)
hdr.render.setObjectFit(mode)
hdr.render.updateOptions(partial)
```

#### `canvas.viewport` — Viewport Control

```typescript
hdr.viewport.getState()                  // { zoom, panX, panY }
hdr.viewport.setConfig(config)           // min/maxZoom, animation settings

// Instant
hdr.viewport.setZoom(zoom)
hdr.viewport.setPan(x, y)
hdr.viewport.setViewport({ zoom, panX, panY })

// Animated
hdr.viewport.zoomIn(factor?)
hdr.viewport.zoomOut(factor?)
hdr.viewport.zoomToFit()
hdr.viewport.zoomToActual()
hdr.viewport.reset(animated?)
```

#### `canvas.interaction` — Interactions

```typescript
const detach = hdr.interaction.attach({
  wheel?: boolean
  drag?: boolean
  touch?: boolean
  keyboard?: boolean
  minZoom?: number
  maxZoom?: number
})
hdr.interaction.detach()
```

#### `canvas.control` — Canvas Control

```typescript
hdr.control.enableAutoResize()
hdr.control.disableAutoResize()
hdr.control.getImageDimensions()         // { width, height }
hdr.control.getImageInfo()               // { width, height, aspectRatio }
hdr.control.forceRender()
```

#### `canvas.loading` — Image Loading

```typescript
await hdr.loading.upload(imageData)      // Direct upload

await hdr.loading.load(
  async (signal) => fetchAndDecodeImage(signal),
  {
    placeholder: placeholderImageData,
    errorFallback: fallbackImageData,
    timeout: 10000,
  }
)

hdr.loading.cancel()
hdr.loading.getState()                   // LoadingState
```

#### `canvas.export` — Image Export

```typescript
const blob = await hdr.export.toBlob({
  format: 'image/png',        // or 'image/jpeg'
  quality: 0.95,              // for JPEG
  encoder: async (pixels) => myCustomEncoder(pixels),  // custom
})
```

#### `canvas.on()` — Events

```typescript
// Unsubscribe function returned
const unsub = hdr.on('viewport:update', ({ state }) => {})
hdr.on('viewport:mutation', ({ mutation, prev, target }) => {})
hdr.on('viewport:transitionEnd', ({ state }) => {})
hdr.on('loading:stateChange', ({ state, type }) => {})
hdr.on('render:settingsChanged', ({ settings }) => {})
hdr.on('render:beforeFrame', () => {})   // fires before each GPU draw
hdr.on('render:complete', () => {})      // fires after each GPU draw
hdr.on('canvas:resized', ({ width, height }) => {})
hdr.on('runtime:stateChange', ({ state }) => {})

// With throttle
hdr.on('viewport:update', handler, { throttle: 16 })
```

---

## Plugin System

Plugins extend HDRCanvas without modifying core code.

```typescript
import { HDRCanvas, type HDRPlugin, type PluginContext } from '@dimkatet/hdr-image-renderer'
```

### Plugin Interface

```typescript
interface HDRPlugin {
  readonly name: string
  install(ctx: PluginContext): void | Promise<void>
  uninstall?(): void | Promise<void>
}

interface PluginContext {
  canvas: HTMLCanvasElement    // DOM canvas element
  services: ServiceRegistry   // DI container (access any service)
  events: TypedEventBus       // Unified event bus (all canvas events)
  logger: Logger              // Debug logger
}
```

### Plugin Types

**RenderPlugin** — hook into the render loop:

```typescript
const renderOverlayPlugin: HDRPlugin = {
  name: 'render-overlay',
  install(ctx) {
    const overlay = document.createElement('canvas')
    ctx.canvas.parentElement?.appendChild(overlay)

    ctx.events.on('render:beforeFrame', () => {
      // update before each GPU frame
    })
    ctx.events.on('render:complete', () => {
      drawOverlayOnTop(overlay, ctx.canvas)
    })
  },
  uninstall() {
    overlay.remove()
  }
}
```

**InputPlugin** — add custom input behavior:

```typescript
const shortcutPlugin: HDRPlugin = {
  name: 'shortcuts',
  install(ctx) {
    const vp = ctx.services.get('viewport')
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'r') vp.reset()
      if (e.key === '1') ctx.services.get('commands').zoomToActual()
    }
    ctx.canvas.addEventListener('keydown', handler)
    this._cleanup = () => ctx.canvas.removeEventListener('keydown', handler)
  },
  uninstall() { this._cleanup?.() }
}
```

**ExportPlugin** — custom export format:

```typescript
const hdrExportPlugin: HDRPlugin = {
  name: 'hdr-export',
  install(ctx) {
    // Save reference for later use
    this._export = ctx.services.get('export')
  },
  async exportAsHDR() {
    return this._export.toBlob({ encoder: encodeToRadianceHDR })
  }
}
```

### Registering Plugins

```typescript
// Before initialize() — installed when runtime starts
const hdr = new HDRCanvas(canvas)
  .use(renderOverlayPlugin)
  .use(shortcutPlugin)

await hdr.initialize()

// After initialize() — installed immediately (hot-add)
hdr.use(latePlugin)
```

Plugins are automatically uninstalled on `destroy()` and reinstalled on `restart()`.

---

## Custom Rendering Backend

Swap out the default WebGPU renderer with your own implementation:

```typescript
import { HDRCanvas, type RendererService } from '@dimkatet/hdr-image-renderer'
import type { RuntimeContext } from '@dimkatet/hdr-image-renderer'

class MyWebGLRenderer implements RendererService {
  // Renderer interface:
  async initialize(): Promise<void> { /* init WebGL context */ }
  render(options: RenderOptions): void { /* draw frame */ }
  async uploadImage(image: ImageData): Promise<void> { /* upload texture */ }
  getImageDimensions(): { width: number; height: number } { return this._dims }
  async readPixels(options: RenderOptions): Promise<PixelReadback> { /* readback */ }
  dispose(): void { /* cleanup */ }

  // RuntimeService lifecycle:
  async init(_ctx: RuntimeContext): Promise<void> { await this.initialize() }
  start(): void {}
  stop(): void {}
}

const hdr = new HDRCanvas(canvas, {
  renderer: new MyWebGLRenderer(),
  exposure: 0,
  toneMapping: 'aces',
})
await hdr.initialize()
```

---

## Image Data Types

The library accepts two image data formats:

```typescript
// LinearImageData — HDR sources (Radiance .hdr, OpenEXR, raw)
{
  data: Float32Array | Float16Array  // linear RGB, can exceed 1.0
  width: number
  height: number
  channels: 3 | 4
  transferFunction: 'linear'
}

// EncodedImageData — standard images (PNG/JPEG decoded to sRGB)
{
  data: Uint8Array | Uint16Array     // encoded integer values
  width: number
  height: number
  channels: 3 | 4
  transferFunction: 'srgb' | 'pq'
}
```

Decoders are not included — bring your own or use the reference implementations in the example app.

---

## Color Science

All color data is treated as **scene-referred, linear BT.709**.

### Rendering Pipeline

**HDR Mode** (native HDR displays):
```
Linear RGB → Exposure → Color Space Transform → sRGB EOTF⁻¹ → rgba16float (toneMapping: extended) → HDR Display
```

**SDR Mode** (standard displays):
```
Linear RGB → Exposure → Tone Mapping [0,1] → Color Space Transform → sRGB EOTF⁻¹ → bgra8unorm → SDR Display
```

### Tone Mapping Operators

- **None** — `clamp(x, 0, 1)`
- **Reinhard** — `x / (1 + x)`
- **ACES** — Narkowicz 2015 approximation

---

## License

MIT
