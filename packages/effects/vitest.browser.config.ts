import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'pixels',
    browser: {
      enabled: true,
      headless: true,
      provider: 'playwright',
      instances: [
        {
          browser: 'chromium',
          launch: {
            // SwiftShader provides a software WebGPU renderer — no physical GPU required.
            // Works in CI and WSL2 environments.
            args: [
              '--enable-unsafe-webgpu',
              '--enable-features=Vulkan',
              '--use-angle=swiftshader',
              '--disable-gpu-sandbox',
            ],
          },
        },
      ],
    },
    include: ['src/__tests__/pixels/**/*.test.ts'],
    // No global setup — tests run in a real browser context
    setupFiles: [],
  },
})
