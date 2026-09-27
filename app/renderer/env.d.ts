import type { AtlasBridge } from '@shared/bridge'

declare global {
  interface Window {
    /** Exposed by preload/index.ts. The only way the renderer reaches anything. */
    atlas: AtlasBridge
  }
}

declare module '*.css'
declare module '*.woff2'

export {}
