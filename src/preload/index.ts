import { contextBridge, ipcRenderer } from 'electron'

// ── The renderer's entire allowed surface ───────────────────────────
// Every key here becomes a function on window.api in the Svelte app.
// This object IS the security boundary: the UI can do these things and
// nothing else. Adding a key grants a capability — do it deliberately.
//
// Each function is a thin wrapper over one named channel. We do NOT
// expose ipcRenderer itself.
//
// NOTE: the scaffold also exposed `window.electron` (from
// @electron-toolkit/preload), a generic ipcRenderer that could invoke
// ANY channel with ANY payload. It was useful for proving the IPC path
// in Phase 2 from the devtools console, but leaving it in place would
// defeat the point of having an allowlist at all — so it's gone.
// Debug from the console with window.api instead.
//
// Keep this in sync with MacroBookAPI in api.d.ts — nothing checks it
// for you.
const api = {
  // ── Foods ─────────────────────────────────────────────────────────
  listFoods: () => ipcRenderer.invoke('foods:list'),
  addFood: (food: NewFood) => ipcRenderer.invoke('foods:add', food),
  updateFood: (id: number, food: NewFood) => ipcRenderer.invoke('foods:update', id, food),
  deleteFood: (id: number) => ipcRenderer.invoke('foods:delete', id),

  // ── Profile ───────────────────────────────────────────────────────
  getProfile: () => ipcRenderer.invoke('profile:get'),
  setUsername: (username: string) => ipcRenderer.invoke('profile:setUsername', username),

  // ── Goals ─────────────────────────────────────────────────────────
  getGoals: () => ipcRenderer.invoke('goals:get'),
  setGoals: (goals: Goals) => ipcRenderer.invoke('goals:set', goals),

  // ── Daily log ─────────────────────────────────────────────────────
  // Main owns the current date so the UI can't disagree about when
  // "today" ends.
  today: () => ipcRenderer.invoke('log:today'),
  addLogEntry: (entry: NewLogEntry) => ipcRenderer.invoke('log:add', entry),
  addManualLogEntry: (entry: ManualLogEntry) => ipcRenderer.invoke('log:addManual', entry),
  deleteLogEntry: (id: number) => ipcRenderer.invoke('log:delete', id),
  listLogEntries: (date: string) => ipcRenderer.invoke('log:listDay', date),
  getDayTotals: (date: string) => ipcRenderer.invoke('log:dayTotals', date),
  // The one query behind both History and Trends.
  getRangeTotals: (from: string, to: string) => ipcRenderer.invoke('log:rangeTotals', from, to),

  // ── Daily check-in ────────────────────────────────────────────────
  getDayStats: (date: string) => ipcRenderer.invoke('dayStats:get', date),
  getDayStatsRange: (from: string, to: string) => ipcRenderer.invoke('dayStats:range', from, to),
  saveDayStats: (stats: DayStats) => ipcRenderer.invoke('dayStats:save', stats)
}

// contextIsolation is on by default in modern Electron, so the page's
// `window` is a different object from this script's. exposeInMainWorld
// is the only sanctioned way across, and it copies rather than shares —
// the page can never reach back through `api` to grab Electron internals.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Fallback for contextIsolation:false, which we don't use.
  // @ts-ignore (defined in api.d.ts)
  window.api = api
}
