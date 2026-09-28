import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

const shared = resolve(__dirname, 'src/shared')
// Atlas's own version. Unpackaged, app.getVersion() reports Electron's instead.
const version = (JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version

/**
 * The production CSP (in renderer/index.html) allows no connections at all.
 * Only the dev server needs one: Vite's hot-reload websocket on localhost.
 */
function devCsp(): Plugin {
  return {
    name: 'atlas-dev-csp',
    apply: 'serve',
    transformIndexHtml(html: string) {
      return html.replace("connect-src 'none'", 'connect-src ws://localhost:* http://localhost:*')
    },
  }
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    define: { __ATLAS_VERSION__: JSON.stringify(version) },
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: resolve(__dirname, 'main/index.ts') } },
    },
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { index: resolve(__dirname, 'preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'renderer'),
    resolve: { alias: { '@shared': shared } },
    esbuild: { jsx: 'automatic' },
    plugins: [devCsp()],
    build: {
      minify: 'esbuild',
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: { input: { index: resolve(__dirname, 'renderer/index.html') } },
    },
  },
})
