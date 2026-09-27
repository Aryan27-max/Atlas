/**
 * The Atlas design kit. Every screen uses only these tokens and components.
 * Inter is bundled for Windows; macOS uses the system font (SF Pro is never
 * bundled: its licence covers Apple platforms only).
 */

import '@fontsource-variable/inter'
import './tokens.css'
import './base.css'
import './components.css'

export * from './controls'
export * from './feedback'
export * from './layout'
export * from './overlays'
export * from './band'
export { cx } from './cx'
export { fade, gentle, snappy } from './motion'
