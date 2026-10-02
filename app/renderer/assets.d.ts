// Side-effect imports Vite handles (stylesheets, the bundled Inter font).
declare module '*.css'
declare module '@fontsource-variable/inter'
// Brand art (renderer/assets/brand/): a URL, shown only with <img src> (never inlined as markup).
declare module '*.svg' {
  const url: string
  export default url
}
