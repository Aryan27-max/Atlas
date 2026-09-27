import { defineConfig } from '@playwright/test'

// Electron end-to-end tests. They launch the built app (`npm run e2e` builds first),
// which spawns the real Python engine from the repository's .venv.
export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
})
