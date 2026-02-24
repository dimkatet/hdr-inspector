import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

// https://vite.dev/config/
export default defineConfig({
  plugins: [wasm(), topLevelAwait(), react()],
  optimizeDeps: {
    exclude: [
      '@dimkatet/jcodecs-avif',
      '@dimkatet/jcodecs-exr',
      '@dimkatet/jcodecs-jxl',
      '@dimkatet/jcodecs-auto',
    ],
  },
  worker: {
    format: 'es',
    plugins: () => [wasm()],
  },
  server: {
    fs: {
      allow: ['.', '../../node_modules', '/home/dimkatet/personal/hdr/jCodecs'],
    },
  },
});
