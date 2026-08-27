// Light / dark theming.
//
// The whole mechanism is one attribute on <html>: base.css defines the
// light tokens on :root and overrides them under :root[data-theme='dark'].
// No component knows which theme is active.
//
// Persistence uses localStorage rather than SQLite on purpose: it's
// SYNCHRONOUS, so main.ts can apply the saved theme before Svelte mounts
// and you never see a flash of the wrong colours. An IPC round-trip
// would arrive a frame or two too late.
// (Trade-off: localStorage is per-origin, so the dev server and a
// packaged build keep separate values. Fine for a preference.)
export type Theme = 'light' | 'dark'

const KEY = 'macrobook:theme'

export function readTheme(): Theme {
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(KEY, theme)
}
