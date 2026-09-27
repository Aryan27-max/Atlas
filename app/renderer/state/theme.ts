/**
 * Appearance: "system" follows the OS; "light" / "dark" override it. Applied to
 * the page (<html data-theme>) and to the native window chrome (main), and
 * saved by the engine with the other settings.
 */

import type { Theme } from '@shared/bridge'

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  void window.atlas.app.setTheme(theme)
}
