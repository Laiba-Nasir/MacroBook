// Everything here is declared GLOBAL rather than exported.
//
// Why: the renderer needs these types, but tsconfig.web.json deliberately
// cannot see src/main (the renderer must never import main-process code).
// Declaring them globally lets Svelte components use FoodRow and NewFood
// with no import at all, and avoids duplicating the interface in a third
// place. The trade-off is that these names are now global to the project.
declare global {
  // One row of the `foods` table, as it arrives in the renderer.
  // Mirror of FoodRow in src/main/db.ts.
  // A food is a name plus the macros for one portion of it. There is no
  // serving weight and no scaling — logging one copies these numbers in.
  interface FoodRow {
    id: number
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }

  // What the form sends when creating a food: everything but the id.
  type NewFood = Omit<FoodRow, 'id'>

  // Empty username means first run — the UI shows a welcome screen.
  interface Profile {
    username: string
  }

  // ── Goals (Phase 6) ─────────────────────────────────────────────
  interface Goals {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }

  // ── Daily log (Phase 7) ─────────────────────────────────────────
  type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

  // A logged entry. name + macros are a SNAPSHOT already scaled to
  // `grams`, so editing or deleting a food never rewrites history.
  interface LogEntry {
    id: number
    food_id: number | null
    date: string
    meal: MealType
    /** null for a manually-typed entry, which has no amount to scale. */
    grams: number | null
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }

  // Macros typed straight in — no food_id, no grams.
  interface ManualLogEntry {
    date: string
    meal: MealType
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }

  interface NewLogEntry {
    food_id: number
    date: string
    meal: MealType
  }

  // One check-in per day. All fields optional — null means "not
  // recorded", which is deliberately different from zero.
  interface DayStats {
    date: string
    weight_kg: number | null
    steps: number | null
    worked_out: boolean
    notes: string | null
  }

  interface DayTotals {
    date: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }

  // The contract for window.api — must match the `api` object in
  // src/preload/index.ts. TypeScript does NOT verify these against each
  // other; a mismatch compiles clean and fails at runtime.
  //
  // Every method returns a Promise: the value crosses a process
  // boundary, so it can never be synchronous.
  interface MacroBookAPI {
    listFoods: () => Promise<FoodRow[]>
    addFood: (food: NewFood) => Promise<FoodRow>
    updateFood: (id: number, food: NewFood) => Promise<FoodRow>
    deleteFood: (id: number) => Promise<void>

    getProfile: () => Promise<Profile>
    setUsername: (username: string) => Promise<Profile>

    getGoals: () => Promise<Goals>
    setGoals: (goals: Goals) => Promise<Goals>

    today: () => Promise<string>
    addLogEntry: (entry: NewLogEntry) => Promise<LogEntry>
    addManualLogEntry: (entry: ManualLogEntry) => Promise<LogEntry>
    deleteLogEntry: (id: number) => Promise<void>
    listLogEntries: (date: string) => Promise<LogEntry[]>
    getDayTotals: (date: string) => Promise<DayTotals>
    getRangeTotals: (from: string, to: string) => Promise<DayTotals[]>

    getDayStats: (date: string) => Promise<DayStats>
    getDayStatsRange: (from: string, to: string) => Promise<DayStats[]>
    saveDayStats: (stats: DayStats) => Promise<DayStats>
  }

  interface Window {
    // `electron` (generic ipcRenderer) is deliberately NOT exposed —
    // see the note in preload/index.ts. window.api is the whole surface.
    api: MacroBookAPI
  }
}

export {}
