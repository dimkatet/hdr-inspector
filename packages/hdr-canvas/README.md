# @dimkatet/hdr-canvas

WebGPU-based HDR image viewer with native HDR display support.

## Features

- 🎨 **Native HDR rendering** with WebGPU
- 📊 **Radiance HDR (.hdr) decoder** built-in
- 🎛️ **Tone mapping** operators (None, Reinhard, ACES)
- 🌈 **Color space support** (sRGB, Display P3, Rec.2020)
- ⚡ **Zero dependencies** (except React for `/react` export)
- 📦 **Tree-shakeable** ESM exports
- 🔧 **TypeScript** first-class support

## Installation

```bash
npm install @dimkatet/hdr-canvas
# or
pnpm add @dimkatet/hdr-canvas
# or
yarn add @dimkatet/hdr-canvas
```

## Browser Requirements

- **Chrome/Edge 113+** (Windows/macOS) - Full WebGPU + HDR support
- **Safari 18+** (macOS) - WebGPU support, partial HDR canvas
- **Firefox Nightly** - Experimental WebGPU only

## Usage

### Vanilla JavaScript

```typescript
import { HDRCanvas } from '@dimkatet/hdr-canvas'

const canvas = document.querySelector('canvas')
const hdrCanvas = new HDRCanvas(canvas, {
  hdrMode: true,
  exposure: 0,
  toneMapping: 'aces',
  colorSpace: 'display-p3'
})

// Load HDR file
const response = await fetch('image.hdr')
const buffer = await response.arrayBuffer()
await hdrCanvas.loadRadianceHDR(buffer)

// Or load from File input
input.addEventListener('change', async (e) => {
  const file = e.target.files[0]
  await hdrCanvas.loadFile(file)
})

// Update settings
hdrCanvas.setExposure(1.5)
hdrCanvas.setToneMapping('reinhard')
hdrCanvas.setHDRMode(false)
```

### React

```tsx
import { HDRCanvas } from '@dimkatet/hdr-canvas/react'
import { useState } from 'react'

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [exposure, setExposure] = useState(0)

  return (
    <>
      <HDRCanvas
        image={file}
        exposure={exposure}
        toneMapping="aces"
        hdrMode={true}
        colorSpace="display-p3"
        onLoad={() => console.log('Loaded!')}
        onError={(err) => console.error(err)}
      />
      <input
        type="file"
        accept=".hdr"
        onChange={(e) => setFile(e.target.files[0])}
      />
      <input
        type="range"
        min="-5"
        max="5"
        step="0.1"
        value={exposure}
        onChange={(e) => setExposure(parseFloat(e.target.value))}
      />
    </>
  )
}
```

### Using Decoder Directly

```typescript
import { decodeRadianceHDR } from '@dimkatet/hdr-canvas'

const buffer = await fetch('image.hdr').then(r => r.arrayBuffer())
const imageData = decodeRadianceHDR(buffer)

console.log(imageData.width, imageData.height)
console.log(imageData.data) // Float32Array - linear RGB
```

### Detecting HDR Capabilities

```typescript
import { detectHDRCapabilities } from '@dimkatet/hdr-canvas'

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

- `initialize(): Promise<void>` - Initialize WebGPU (called automatically on first load)
- `loadImage(data: LinearImageData): Promise<void>` - Load from LinearImageData
- `loadRadianceHDR(buffer: ArrayBuffer): Promise<void>` - Load Radiance HDR file
- `loadFile(file: File): Promise<void>` - Load from File (auto-detects format)
- `setExposure(ev: number): void` - Set exposure value
- `setToneMapping(op: string): void` - Set tone mapping operator
- `setHDRMode(enabled: boolean): void` - Enable/disable HDR mode
- `setColorSpace(cs: string): void` - Set color space
- `setVisualizationMode(mode: string): void` - Set visualization mode
- `getRenderState(): RenderState` - Get current render state
- `destroy(): void` - Cleanup GPU resources

### React Component

```typescript
interface HDRCanvasProps extends HDRCanvasOptions {
  image?: LinearImageData | File
  onLoad?: () => void
  onError?: (error: Error) => void
  className?: string
  style?: React.CSSProperties
}
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
