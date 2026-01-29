import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
  ],
  optimizeDeps: {
    exclude: [
      '@dimkatet/jcodecs-avif',
      '@monogrid/gainmap-js',
    ],
  },
  worker: {
    format: 'es',
    plugins: () => [wasm()],
  },
  server: {
    fs: {
      allow: [
        ".",
        "../../node_modules",
        "/home/dimkatet/personal/hdr/jCodecs"
      ]
    }
  }

});
