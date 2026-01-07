# HDR Inspector

Scene-referred linear HDR image viewer with **native HDR output support** via WebGPU and PQ encoding.

## Features

- **Native HDR Output**: PQ (ST.2084) encoding for true HDR displays (when available)
- **WebGPU Rendering**: Modern GPU API with rgba32float textures for HDR storage
- **Correct HDR Handling**: Treats HDR files as ground truth linear scene-referred data
- **Explicit Exposure Control**: Exposure adjustment in EV stops (-10 to +10)
- **Multiple Tone Mapping Operators**:
  - None (explicit clamp)
  - Reinhard
  - ACES (Narkowicz 2015 fit)
- **Visualization Modes**:
  - RGB (standard view)
  - False-color luminance (Turbo colormap)
  - Clipping indicator (shows clipping in magenta)
- **HDR Capability Detection**: Automatic detection of WebGPU, HDR display, and color gamut support
- **Supported Formats**:
  - Radiance HDR (.hdr, .pic) with RGBE encoding
  - OpenEXR (.exr) - *Coming soon*

## Architecture

### HDR vs SDR Rendering Modes

**HDR Mode (native HDR displays)**:
```
Linear RGB (scene-referred)
  ↓
Exposure (EV stops)
  ↓
PQ Encoding (ST.2084)
  ↓
HDR Display (> 80 nits peak)
```

**SDR Mode (standard displays)**:
```
Linear RGB (scene-referred)
  ↓
Exposure (EV stops)
  ↓
Tone Mapping
  ↓
sRGB Encoding
  ↓
SDR Display (~80-100 nits peak)
```

### Key Principles

- **Input color space**: Linear BT.709 (scene-referred)
- **Luminance weights**: Y = 0.2126R + 0.7152G + 0.0722B (BT.709)
- **No implicit transforms**: All color operations are explicit and controllable
- **HDR encoding**: PQ (Perceptual Quantizer) for 0-10000 nits range
- **SDR encoding**: sRGB transfer function after tone mapping

### Project Structure

```
src/
├── core/                      # Color science & decoding (UI-agnostic)
│   ├── decode.ts              # HDR file decoders (Radiance HDR)
│   ├── color.ts               # Tone mapping, luminance, transfer functions
│   └── hdr-capabilities.ts    # HDR support detection
├── renderer/                  # WebGPU rendering
│   ├── WebGPURenderer.ts      # GPU context, texture upload, rendering
│   └── shaders-webgpu.ts      # WGSL shaders (vertex + fragment)
├── ui/                        # React components
│   ├── App.tsx                # Main application
│   ├── ImageCanvas.tsx        # WebGPU canvas wrapper
│   ├── Controls.tsx           # Exposure/tone mapping UI
│   ├── FileDrop.tsx           # File loading
│   └── HDRInfo.tsx            # HDR capabilities display
└── types.ts                   # TypeScript definitions
```

## Development

### Prerequisites

- **Node.js** 20.19+ or 22.12+ (recommended)
- **pnpm** (or npm/yarn)
- **Modern browser** with WebGPU support:
  - Chrome/Edge 113+
  - Safari 18+ (macOS)
  - Firefox Nightly (experimental)

### Setup

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build
```

### Testing

1. **Load a Radiance HDR file** (.hdr) via drag-and-drop
2. **Adjust exposure** using the slider (-10 to +10 EV)
3. **Try tone mapping operators** (None, Reinhard, ACES)
4. **Switch visualization modes** (RGB, Luminance, Clipping)
5. **Enable HDR mode** (if you have an HDR display)

### HDR Testing

To test HDR output:
- **Windows**: HDR monitor + Chrome/Edge with HDR enabled in Windows settings
- **macOS**: HDR display (e.g., MacBook Pro) + Safari 18+ or Chrome

Check the **HDR Capabilities** panel (top-right) to see your system's support.

## Technical Details

### WebGPU Rendering

- **API**: WebGPU (native HDR support)
- **Texture format**: `rgba32float` (unfilterable-float for HDR storage)
- **Canvas format**: `rgba16float` (HDR mode) or `bgra8unorm` (SDR mode)
- **Shaders**: WGSL (WebGPU Shading Language)
- **Color space**: `rec2020` (HDR), `display-p3`, or `srgb` (fallback)

### Radiance HDR Decoding

- **RGBE encoding**: `RGB = (R, G, B) × 2^(E - 128) / 256`
- **RLE compression**: Automatic detection and decompression
- **Header metadata**: Currently ignored (EXPOSURE, etc.)

### PQ (ST.2084) Encoding

For HDR mode, linear scene-referred values are converted to absolute luminance in nits, then PQ-encoded:

```
absoluteNits = sceneLinear × diffuseWhiteNits  // 203 nits for diffuse white (BT.2100)
Y = absoluteNits / 10000.0                      // Normalize to PQ reference
PQ = ((c1 + c2 × Y^m1) / (1 + c3 × Y^m1))^m2   // Apply PQ transfer function
```

**Constants (SMPTE ST 2084)**:
- m1 = 0.1593, m2 = 78.8438
- c1 = 0.8359, c2 = 18.8516, c3 = 18.6875

### Tone Mapping (SDR Mode)

All operators work per-channel in linear space:

- **None**: `clamp(x, 0, 1)`
- **Reinhard**: `x / (1 + x)`
- **ACES**: `(x×(2.51x+0.03))/(x×(2.43x+0.59)+0.14)`

### sRGB Encoding (SDR Mode)

After tone mapping, sRGB transfer function is applied:

```
if (x ≤ 0.0031308):
  sRGB = 12.92 × x
else:
  sRGB = 1.055 × x^(1/2.4) - 0.055
```

### HDR Capabilities Detection

Detects:
- **WebGPU support**: `navigator.gpu` availability
- **Display HDR**: `matchMedia('(dynamic-range: high)')`
- **Color gamut**: sRGB, Display-P3, or Rec.2020
- **Video HDR**: VP9 Profile 2 codec support
- **Canvas HDR**: WebGPU + HDR display combination

## Browser Support

| Browser | WebGPU | HDR Canvas | Status |
|---------|--------|------------|--------|
| Chrome 113+ (Windows/macOS) | ✅ | ✅ | Full support |
| Edge 113+ (Windows) | ✅ | ✅ | Full support |
| Safari 18+ (macOS) | ✅ | ⚠️ | WebGPU yes, HDR canvas partial |
| Firefox | ⚠️ | ❌ | Experimental WebGPU only |

**Note**: HDR output requires both browser support AND an HDR-capable display.

## Roadmap

### Completed ✅

- [x] WebGPU renderer with HDR support
- [x] Radiance HDR (.hdr) decoder
- [x] Exposure control (-10 to +10 EV)
- [x] Tone mapping operators (None, Reinhard, ACES)
- [x] Visualization modes (RGB, luminance, clipping)
- [x] PQ encoding for native HDR output
- [x] HDR capability detection
- [x] sRGB fallback for SDR displays

### Planned 🚧

- [ ] OpenEXR support (tinyexr WASM)
- [ ] Histogram analysis (linear + log luminance)
- [ ] Histogram UI panel
- [ ] Color space metadata handling (embedded chromaticity)
- [ ] Zoom and pan controls
- [ ] Image statistics panel (min/max/avg/percentiles)
- [ ] Multi-channel EXR support
- [ ] LUT export (3D LUT generation)

## References

### Standards

- **PQ (ST.2084)**: SMPTE ST 2084 - High Dynamic Range Electro-Optical Transfer Function
- **BT.709**: ITU-R Recommendation BT.709 - HDTV color space
- **BT.2100**: ITU-R Recommendation BT.2100 - HDR television (PQ and HLG)
- **sRGB**: IEC 61966-2-1 - sRGB color space

### Resources

- **Radiance HDR format**: http://radsite.lbl.gov/radiance/refer/filefmts.pdf
- **ACES tone mapping**: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
- **Turbo colormap**: https://ai.googleblog.com/2019/08/turbo-improved-rainbow-colormap-for.html
- **WebGPU spec**: https://www.w3.org/TR/webgpu/

## License

MIT
