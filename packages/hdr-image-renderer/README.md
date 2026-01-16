# @dimkatet/hdr-image-renderer

WebGPU-based HDR image viewer with native HDR display support.

## Features

- 🎨 **Native HDR rendering** with WebGPU
- 📊 **Radiance HDR (.hdr) decoder** built-in
- 🎛️ **Tone mapping** operators (None, Reinhard, ACES)
- 🌈 **Color space support** (sRGB, Display P3, Rec.2020)
- 🖱️ **Interactive** - zoom, pan, touch gestures
- 🎯 **Programmatic control** - imperative API via ref
- ⚡ **Zero dependencies** (except React for `/react` export)
- 📦 **Tree-shakeable** ESM exports
- 🔧 **TypeScript** first-class support

## Installation

```bash
npm install @dimkatet/hdr-image-renderer
# or
pnpm add @dimkatet/hdr-image-renderer
# or
yarn add @dimkatet/hdr-image-renderer
```

## Browser Requirements

- **Chrome/Edge 113+** (Windows/macOS) - Full WebGPU + HDR support
- **Safari 18+** (macOS) - WebGPU support, partial HDR canvas
- **Firefox Nightly** - Experimental WebGPU only

## Usage

### Vanilla JavaScript

```typescript
import { HDRCanvas } from '@dimkatet/hdr-image-renderer'

const canvas = document.querySelector('canvas')
const hdrCanvas = new HDRCanvas(canvas, {
  hdrMode: true,
  exposure: 0,
  toneMapping: 'aces',
  colorSpace: 'display-p3'
})

// Initialize and load HDR file
await hdrCanvas.initialize()
const response = await fetch('image.hdr')
const buffer = await response.arrayBuffer()
await hdrCanvas.loadRadianceHDR(buffer)

// Enable auto-resize
hdrCanvas.enableAutoResize()

// Attach interactions (wheel, drag, touch)
const cleanup = hdrCanvas.attachInteractions({
  wheel: true,
  drag: true,
  touch: true,
  minZoom: 0.5,
  maxZoom: 20,
  onAnimationEnd: (viewport) => {
    console.log('Zoom:', viewport.zoom)
  }
})

// Or programmatic control
hdrCanvas.zoomIn(2)      // Zoom in 2x
hdrCanvas.zoomOut()      // Zoom out 2x
hdrCanvas.zoomToFit()    // Show entire image
hdrCanvas.zoomToActual() // 1:1 pixel mapping
hdrCanvas.resetViewportAnimated() // Reset with animation

// Update render settings
hdrCanvas.setExposure(1.5)
hdrCanvas.setToneMapping('reinhard')
hdrCanvas.setHDRMode(false)

// Cleanup
cleanup() // Remove interaction listeners
hdrCanvas.destroy() // Destroy GPU resources
```

### React

```tsx
import { HDRImage, type HDRImageHandle } from '@dimkatet/hdr-image-renderer/react'
import { useState, useRef } from 'react'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [exposure, setExposure] = useState(0)
  const [zoom, setZoom] = useState(1)
  const hdrRef = useRef<HDRImageHandle>(null)

  return (
    <>
      <HDRImage
        ref={hdrRef}
        image={file}
        options={{
          exposure,
          toneMapping: 'aces',
          hdrMode: true,
          colorSpace: 'display-p3',
        }}
        interactions={{
          wheel: true,
          drag: true,
          touch: true,
          minZoom: 0.5,
          maxZoom: 20,
        }}
        onAnimationEnd={(viewport) => setZoom(viewport.zoom)}
        onLoad={() => console.log('Loaded!')}
        onError={(err) => console.error(err)}
        fitToImage
        style={{ maxHeight: '80vh' }}
      />

      {/* Controls */}
      <div>
        <input
          type="file"
          accept=".hdr"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <input
          type="range"
          min="-5"
          max="5"
          step="0.1"
          value={exposure}
          onChange={(e) => setExposure(parseFloat(e.target.value))}
        />
        <div>
          <button onClick={() => hdrRef.current?.zoomIn()}>Zoom In</button>
          <span>Zoom: {zoom.toFixed(2)}x</span>
          <button onClick={() => hdrRef.current?.zoomOut()}>Zoom Out</button>
          <button onClick={() => hdrRef.current?.zoomToFit()}>Fit</button>
          <button onClick={() => hdrRef.current?.resetViewport()}>Reset</button>
        </div>
      </div>
    </>
  )
}
```

### Using Decoder Directly

```typescript
import { decodeRadianceHDR } from '@dimkatet/hdr-image-renderer'

const buffer = await fetch('image.hdr').then(r => r.arrayBuffer())
const imageData = decodeRadianceHDR(buffer)

console.log(imageData.width, imageData.height)
console.log(imageData.data) // Float32Array - linear RGB
```

### Detecting HDR Capabilities

```typescript
import { detectHDRCapabilities } from '@dimkatet/hdr-image-renderer'

const caps = await detectHDRCapabilities()
console.log('WebGPU supported:', caps.webgpuSupported)
console.log('Display HDR:', caps.displayHDR)
console.log('Canvas HDR:', caps.canvasHDR)
console.log('Color gamut:', caps.colorGamut)
```

## API Reference

### HDRCanvas

Main class for HDR rendering.

#### Constructor

```typescript
new HDRCanvas(canvas: HTMLCanvasElement, options?: HDRCanvasOptions)
```

**Options:**
- `hdrMode?: boolean` - Enable HDR mode (default: `false`)
- `exposure?: number` - Exposure in EV stops (default: `0`)
- `toneMapping?: 'none' | 'reinhard' | 'aces'` - Tone mapping operator (default: `'aces'`)
- `colorSpace?: 'srgb' | 'display-p3' | 'rec2020'` - Output color space (default: `'display-p3'`)
- `visualizationMode?: 'rgb' | 'luminance' | 'clipping'` - Visualization mode (default: `'rgb'`)

#### Methods

**Loading:**
- `initialize(): Promise<void>` - Initialize WebGPU (called automatically on first load)
- `loadImage(data: LinearImageData): Promise<void>` - Load from LinearImageData
- `loadRadianceHDR(buffer: ArrayBuffer): Promise<void>` - Load Radiance HDR file
- `loadFile(file: File): Promise<void>` - Load from File (auto-detects format)

**Rendering:**
- `setExposure(ev: number): void` - Set exposure value
- `setToneMapping(op: string): void` - Set tone mapping operator
- `setHDRMode(enabled: boolean): void` - Enable/disable HDR mode
- `setColorSpace(cs: string): void` - Set color space
- `setVisualizationMode(mode: string): void` - Set visualization mode
- `getRenderState(): RenderState` - Get current render state

**Viewport Control:**
- `zoomIn(factor?: number): void` - Zoom in (default: 2x)
- `zoomOut(factor?: number): void` - Zoom out (default: 2x)
- `zoomTo(zoom: number): void` - Set specific zoom level
- `zoomToFit(): void` - Show entire image (zoom to 1.0)
- `zoomToActual(): void` - 1:1 pixel mapping
- `resetViewportAnimated(): void` - Reset viewport with animation
- `applyWheelZoom(deltaY, cursorX, cursorY): void` - Apply wheel zoom (low-level)
- `applyDragPan(deltaX, deltaY): void` - Apply drag pan (low-level)

**Interactions:**
- `attachInteractions(options?: InteractionOptions): () => void` - Attach interaction listeners, returns cleanup function
- `setViewportCallbacks(onViewportChange?, onAnimationEnd?): void` - Update viewport callbacks

**Lifecycle:**
- `enableAutoResize(): () => void` - Auto-resize canvas to match CSS size
- `disableAutoResize(): void` - Disable auto-resize
- `getImageInfo(): ImageInfo` - Get loaded image dimensions
- `destroy(): void` - Cleanup GPU resources

### React Component

```typescript
interface HDRImageProps {
  // Image source
  image?: LinearImageData | File

  // Render options
  options: HDRCanvasOptions  // { exposure, toneMapping, hdrMode, colorSpace, visualizationMode, transparent }

  // Interactions
  interactions?: boolean | InteractionsConfig  // Enable/configure zoom, pan, touch
  onViewportChange?: (viewport: ViewportState) => void  // Fires every frame
  onAnimationEnd?: (viewport: ViewportState) => void    // Fires once per animation

  // Layout
  fitToImage?: boolean  // Auto-adjust canvas aspect ratio

  // Callbacks
  onLoad?: (info: ImageInfo) => void  // Called when image loads
  onError?: (error: Error) => void

  // HTML canvas attributes
  className?: string
  style?: React.CSSProperties
}

interface InteractionsConfig {
  // Which interactions are enabled
  wheel?: boolean  // Mouse wheel zoom
  drag?: boolean   // Mouse drag pan
  touch?: boolean  // Touch gestures (pinch, drag, double-tap)

  // Viewport behavior
  minZoom?: number           // Default: 0.1
  maxZoom?: number           // Default: 10
  wheelSensitivity?: number  // Default: 0.001
  animationSpeed?: number    // Default: 0.15
}

interface HDRImageHandle {
  // Zoom controls
  zoomIn: (factor?: number) => void
  zoomOut: (factor?: number) => void
  zoomToFit: () => void
  zoomToActual: () => void

  // Viewport
  resetViewport: () => void
  getViewport: () => ViewportState
  setViewport: (viewport: Partial<ViewportState>) => void

  // Access underlying canvas
  getCanvas: () => HDRCanvas | null
}
```

**Usage with ref:**
```tsx
const ref = useRef<HDRImageHandle>(null)
ref.current?.zoomIn()
ref.current?.getViewport()
```

## Color Science

All color data is treated as **scene-referred, linear BT.709** unless explicitly converted.

### Rendering Pipeline

**HDR Mode:**
```
Linear RGB (scene-referred)
  → Exposure (EV stops, can produce > 1.0)
  → Color Space Transform (BT.709 → target gamut)
  → sRGB Transfer Function (EOTF⁻¹, preserves > 1.0)
  → rgba16float buffer + toneMapping: extended
  → HDR Display (browser handles final PQ encoding)
```

**SDR Mode:**
```
Linear RGB (scene-referred)
  → Exposure (EV stops)
  → Tone Mapping (clamps to [0,1])
  → Color Space Transform (BT.709 → target gamut)
  → sRGB Transfer Function (EOTF⁻¹)
  → bgra8unorm buffer
  → SDR Display (~80-100 nits)
```

## License

MIT

## Author

dimkatet
