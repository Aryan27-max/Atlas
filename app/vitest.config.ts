import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: {
    // Renderer tests declare `// @vitest-environment jsdom` at the top.
    environment: 'node',
    include: ['main/**/*.test.ts', 'renderer/**/*.test.{ts,tsx}', 'src/**/*.test.ts', 'tests/**/*.test.ts'],
    restoreMocks: true,
  },
})
