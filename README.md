# HDR Inspector Monorepo

WebGPU-based HDR image viewer with native HDR display support.

## 📦 Packages

### [@dimkatet/hdr-canvas](./packages/hdr-canvas)
NPM package for HDR image rendering with WebGPU.
- Zero dependencies (except React as optional peer)
- Tree-shakeable ESM exports
- Full TypeScript support
- 26KB bundle size

### [hdr-inspector-demo](./packages/example)
Example application demonstrating `@dimkatet/hdr-canvas` usage.
- React + Vite
- Full HDR workflow example
- UI components for controls

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Build library
pnpm build:lib

# Run example app
pnpm dev:example

# Build everything
pnpm build

# Clean all build artifacts
pnpm clean
```

## 🛠️ Development

This is a [Turborepo](https://turbo.build/) monorepo using [pnpm](https://pnpm.io/) workspaces.

### Commands

```bash
# Run dev mode for all packages
pnpm dev

# Build all packages (parallel)
pnpm build

# Lint all packages
pnpm lint

# Clean all build artifacts
pnpm clean

# Build only the library
pnpm build:lib

# Run only example app
pnpm dev:example
```

### Working on the Library

```bash
cd packages/hdr-canvas

# Watch mode (rebuild on changes)
pnpm dev

# Build once
pnpm build

# Type check
pnpm typecheck

# Clean build artifacts
pnpm clean
```

### Publishing to NPM

```bash
cd packages/hdr-canvas

# Bump version
npm version patch  # or minor, major

# Publish
npm publish --access public
```

## 📁 Project Structure

```
.
├── packages/
│   ├── hdr-canvas/          # NPM library package
│   │   ├── src/
│   │   │   ├── index.ts              # Main exports
│   │   │   ├── HDRCanvas.ts          # Core API
│   │   │   ├── types.ts              # TypeScript types
│   │   │   ├── decoders/             # HDR decoders
│   │   │   ├── core/                 # Color science
│   │   │   ├── renderer/             # WebGPU renderer
│   │   │   └── react/                # React wrapper
│   │   ├── dist/                     # Build output
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── example/             # Demo application
│       ├── src/
│       │   ├── main.tsx
│       │   └── ui/                   # React components
│       ├── public/
│       ├── index.html
│       └── package.json
│
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # PNPM workspace config
└── package.json             # Root config
```

## 🌐 Browser Support

- **Chrome/Edge 113+** (Windows/macOS) - Full WebGPU + HDR
- **Safari 18+** (macOS) - WebGPU, partial HDR
- **Firefox Nightly** - Experimental WebGPU

## 📝 Documentation

- [Library README](./packages/hdr-canvas/README.md) - Full API documentation

## 🔧 Tech Stack

- **Build**: Turborepo + tsup
- **Package Manager**: pnpm
- **Frontend**: React + Vite
- **Language**: TypeScript
- **Graphics**: WebGPU

## 📄 License

MIT
