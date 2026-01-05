# HDR Inspector

Scene-referred linear HDR image viewer with explicit tone mapping control.

## Features

- **Correct HDR Handling**: Treats HDR files as ground truth linear data
- **Explicit Exposure Control**: Exposure adjustment in EV stops (-10 to +10)
- **Multiple Tone Mapping Operators**:
  - None (explicit clamp)
  - Reinhard
  - ACES (Narkowicz 2015 fit)
- **Visualization Modes**:
  - RGB (standard tone-mapped view)
  - False-color luminance (Turbo colormap)
  - Clipping indicator (shows post-tone-map clipping in magenta)
- **Supported Formats**:
  - Radiance HDR (.hdr, .pic) with RGBE encoding
  - OpenEXR (.exr) - *Coming soon*

## Architecture

### Color Pipeline

```
Linear RGB (scene-referred)
  ↓
Exposure (EV stops)
  ↓
Tone Mapping
  ↓
sRGB Encoding
  ↓
Display
```

### Key Assumptions

- **Input color space**: Linear BT.709
- **Luminance weights**: Y = 0.2126R + 0.7152G + 0.0722B (BT.709)
- **No implicit transforms**: All color operations are explicit
- **Display encoding**: sRGB transfer function applied after tone mapping

### Project Structure

```
src/
├── core/           # Color science & decoding (UI-agnostic)
│   ├── decode.ts   # HDR file decoders
│   └── color.ts    # Tone mapping, luminance, transfer functions
├── renderer/       # WebGL rendering
│   ├── WebGLRenderer.ts
│   └── shaders.ts
├── ui/             # React components
│   ├── App.tsx
│   ├── ImageCanvas.tsx
│   ├── Controls.tsx
│   └── FileDrop.tsx
└── types.ts        # TypeScript definitions
```

## Development

### Prerequisites

- Node.js 20.19+ or 22.12+ (recommended)
- pnpm (or npm/yarn)

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

1. Load a Radiance HDR file (.hdr)
2. Adjust exposure using the slider
3. Try different tone mapping operators
4. Switch between visualization modes

## Technical Details

### Radiance HDR Decoding

- RGBE encoding: RGB = (R, G, B) × 2^(E - 128)
- Supports both RLE-compressed and uncompressed scanlines
- Header metadata (EXPOSURE, etc.) is ignored

### WebGL Rendering

- WebGL 2.0 required
- Float32 textures (RGB32F) for HDR storage
- Fullscreen quad with fragment shader pipeline
- No implicit browser HDR handling

### Tone Mapping

All tone mapping operators work per-channel in linear space:

- **None**: `clamp(x, 0, 1)`
- **Reinhard**: `x / (1 + x)`
- **ACES**: `(x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14)`

### Display Encoding

After tone mapping, sRGB transfer function is applied:

```
if (x ≤ 0.0031308):
  sRGB = 12.92 × x
else:
  sRGB = 1.055 × x^(1/2.4) - 0.055
```

This compensates for the browser's implicit sRGB→linear conversion in the display pipeline.

## Roadmap

### MVP (Current)

- [x] Radiance HDR loading
- [x] Exposure control
- [x] Tone mapping (None, Reinhard, ACES)
- [x] Visualization modes
- [x] WebGL rendering

### Future

- [ ] OpenEXR support (tinyexr WASM)
- [ ] Histogram (linear + log luminance)
- [ ] Histogram UI panel
- [ ] Color space metadata handling
- [ ] Zoom and pan
- [ ] Image analysis tools
- [ ] Multi-channel EXR support

## License

MIT
