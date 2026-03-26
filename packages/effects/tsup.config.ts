import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'webgpu/index': 'src/webgpu/index.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
});
