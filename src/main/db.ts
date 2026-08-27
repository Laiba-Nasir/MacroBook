// src/main/db.ts
//
// The ONLY file in MacroBook that talks to SQLite. Main process only.

import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

// One row of the `foods` table.
//
// A food is simply a name and the macros for one portion of it. There is
// no serving weight and no scaling: logging a food copies these numbers
// straight into the day. For an odd portion, use a manual log entry.
export interface FoodRow {
  id: number
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

// What the UI sends when creating a food: every field except `id`,
// which SQLite assigns.
export type NewFood = Omit<FoodRow, 'id'>

// ── Phase 6: goals ──────────────────────────────────────────────────
// Exactly one row, id = 1. A single-row table beats a key/value settings
// table here: the four targets are always read together.
export interface Goals {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

// Who's using this copy of the app. Single row, same CHECK(id = 1)
// pattern as goals. Empty username means first run — the UI shows a
// welcome screen instead of the app until it's set.
export interface Profile {
  username: string
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

// ── Phase 7: the daily log ──────────────────────────────────────────
// One row = one thing eaten on one day.
//
// DESIGN NOTE — this table SNAPSHOTS the macros instead of only pointing
// at a food. name/calories/protein_g/carbs_g/fat_g are the values FOR
// THIS ENTRY, already scaled to `grams`. That deviates from a pure
// foreign-key design, deliberately:
//   1. Editing or deleting a food must not silently rewrite last week's
//      totals. What you ate is a historical fact.
//   2. Every SUM query becomes a plain aggregate with no JOIN and no
//      arithmetic in SQL.
// food_id is kept as a soft reference (ON DELETE SET NULL) so we can
// still tell which library item an entry came from.
export interface LogEntry {
  id: number
  food_id: number | null
  date: string // 'YYYY-MM-DD', local time
  meal: MealType
  /** null for a manually-typed entry, which has no amount to scale. */
  grams: number | null
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

// ── Daily check-in ──────────────────────────────────────────────────
// One row per day, keyed by the date itself — there can only ever be one
// check-in for a given day, so `date` IS the primary key. No separate id.
// Every field is optional: a day where you only logged weight is valid.
export interface DayStats {
  date: string
  weight_kg: number | null
  steps: number | null
  worked_out: boolean
  notes: string | null
}

// A day's totals — the shape Today, History and Trends all consume.
export interface DayTotals {
  date: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

// Local calendar date as 'YYYY-MM-DD'.
// 'en-CA' formats as YYYY-MM-DD, and using the LOCAL date matters:
// toISOString() would roll over at UTC midnight and put late-evening
// entries on tomorrow.
export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

// The one open connection, held at module scope.
let db: Database.Database | null = null

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'macrobook.db')
  console.log('[db] opening', dbPath)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  // SQLite ignores foreign keys unless you ask for them, per connection.
  db.pragma('foreign_keys = ON')

  // ── Migration: Phase 1 schema → Phase 3 schema ────────────────────
  // PRAGMA table_info returns one row per column (empty if no table).
  // If we find the old text column, drop the table. That is destructive
  // and only acceptable because it never held anything but throwaway
  // seed data. Once real data exists this becomes an ALTER TABLE and a
  // user_version bump instead.
  const columns = db.prepare('PRAGMA table_info(foods)').all() as { name: string }[]
  if (columns.some((c) => c.name === 'serving_size')) {
    console.log('[db] Phase 1 schema detected — dropping foods table')
    db.exec('DROP TABLE foods')
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS foods (
      id        INTEGER PRIMARY KEY,
      name      TEXT NOT NULL UNIQUE,
      calories  REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g   REAL NOT NULL,
      fat_g     REAL NOT NULL
    )
  `)

  // Migration: drop serving_grams. A food is now just its macros, with
  // no portion weight to scale from. SQLite 3.35+ supports DROP COLUMN
  // directly, so no table rebuild is needed here.
  if (
    (db.prepare('PRAGMA table_info(foods)').all() as { name: string }[]).some(
      (c) => c.name === 'serving_grams'
    )
  ) {
    console.log('[db] dropping foods.serving_grams — foods no longer have a portion weight')
    db.exec('ALTER TABLE foods DROP COLUMN serving_grams')
  }

  // ── Phase 6: goals ────────────────────────────────────────────────
  // CHECK (id = 1) makes "only one row" a constraint the database
  // enforces, not a convention we hope to remember.
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id        INTEGER PRIMARY KEY CHECK (id = 1),
      calories  REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g   REAL NOT NULL,
      fat_g     REAL NOT NULL
    )
  `)
  // Seed the defaults from the Figma. OR IGNORE means this is a no-op on
  // every launch after the first — it never overwrites the user's targets.
  db.prepare(
    `INSERT OR IGNORE INTO goals (id, calories, protein_g, carbs_g, fat_g)
     VALUES (1, 2000, 120, 220, 65)`
  ).run()

  // ── Profile ───────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id       INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL
    )
  `)
  // Seeded empty on purpose: that's the signal for "first run".
  db.prepare("INSERT OR IGNORE INTO profile (id, username) VALUES (1, '')").run()

  // ── Phase 7: the daily log ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS log_entries (
      id        INTEGER PRIMARY KEY,
      food_id   INTEGER REFERENCES foods(id) ON DELETE SET NULL,
      date      TEXT NOT NULL,
      meal      TEXT NOT NULL DEFAULT 'snack',
      grams     REAL NOT NULL,
      name      TEXT NOT NULL,
      calories  REAL NOT NULL,
      protein_g REAL NOT NULL,
      carbs_g   REAL NOT NULL,
      fat_g     REAL NOT NULL
    )
  `)
  // Migration: grams was NOT NULL originally. Manual entries (macros
  // typed directly, no food, no amount) need it nullable. SQLite can't
  // relax a NOT NULL in place, so the table is rebuilt — but only once,
  // guarded by reading the column's current flag.
  const logCols = db.prepare('PRAGMA table_info(log_entries)').all() as {
    name: string
    notnull: number
  }[]
  if (logCols.find((c) => c.name === 'grams')?.notnull === 1) {
    console.log('[db] making log_entries.grams nullable')
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE log_entries_new (
        id        INTEGER PRIMARY KEY,
        food_id   INTEGER REFERENCES foods(id) ON DELETE SET NULL,
        date      TEXT NOT NULL,
        meal      TEXT NOT NULL DEFAULT 'snack',
        grams     REAL,
        name      TEXT NOT NULL,
        calories  REAL NOT NULL,
        protein_g REAL NOT NULL,
        carbs_g   REAL NOT NULL,
        fat_g     REAL NOT NULL
      );
      INSERT INTO log_entries_new
        SELECT id, food_id, date, meal, grams, name, calories, protein_g, carbs_g, fat_g
        FROM log_entries;
      DROP TABLE log_entries;
      ALTER TABLE log_entries_new RENAME TO log_entries;
    `)
    db.pragma('foreign_keys = ON')
  }

  // History and Trends both filter/group by date, so it gets an index.
  db.exec('CREATE INDEX IF NOT EXISTS idx_log_date ON log_entries(date)')

  // ── Daily check-in: weight, steps, workout, notes ─────────────────
  // SQLite has no BOOLEAN type — worked_out is stored as 0/1 INTEGER and
  // converted to a real boolean at the edge of this module.
  db.exec(`
    CREATE TABLE IF NOT EXISTS day_stats (
      date       TEXT PRIMARY KEY,
      weight_kg  REAL,
      steps      INTEGER,
      worked_out INTEGER NOT NULL DEFAULT 0,
      notes      TEXT
    )
  `)

  console.log(
    `[db] ready — ${listFoods().length} food(s), ${countLogEntries()} log entr(ies), today is ${todayISO()}`
  )
}

// ── Read ────────────────────────────────────────────────────────────
export function listFoods(): FoodRow[] {
  if (!db) throw new Error('[db] listFoods() called before initDatabase()')
  return db.prepare('SELECT * FROM foods ORDER BY name COLLATE NOCASE').all() as FoodRow[]
}

// ── Write ───────────────────────────────────────────────────────────
// Returns the row as actually stored, so the caller gets the real id
// rather than guessing.
//
// Note the named parameters (@name) instead of positional (?). With six
// columns, positional args are a bug waiting to happen — swap two and
// you silently store fat as carbs. Named params bind from the object's
// keys, so order can't drift.
export function addFood(food: NewFood): FoodRow {
  if (!db) throw new Error('[db] addFood() called before initDatabase()')

  const info = db
    .prepare(
      `INSERT INTO foods (name, calories, protein_g, carbs_g, fat_g)
       VALUES (@name, @calories, @protein_g, @carbs_g, @fat_g)`
    )
    .run(food)

  return db.prepare('SELECT * FROM foods WHERE id = ?').get(info.lastInsertRowid) as FoodRow
}

// Replace every field of an existing food. Returns the updated row.
// Same named-parameter binding as addFood — @id included.
export function updateFood(id: number, food: NewFood): FoodRow {
  if (!db) throw new Error('[db] updateFood() called before initDatabase()')

  const info = db
    .prepare(
      `UPDATE foods SET
         name      = @name,
         calories  = @calories,
         protein_g = @protein_g,
         carbs_g   = @carbs_g,
         fat_g     = @fat_g
       WHERE id = @id`
    )
    .run({ ...food, id })

  // changes === 0 means no row had that id.
  if (info.changes === 0) throw new Error(`No food with id ${id}`)

  // Push the correction into every log entry that came from this food.
  //
  // The snapshot columns exist so that DELETING a food can't erase your
  // history — but an EDIT is a correction, and a correction should
  // propagate. If the calories were wrong, the logged total was wrong.
  //
  // Note this rewrites PAST days too. To apply corrections only going
  // forward, add  AND date = <today>  to the WHERE clause.
  db.prepare(
    `UPDATE log_entries SET
       name      = @name,
       calories  = @calories,
       protein_g = @protein_g,
       carbs_g   = @carbs_g,
       fat_g     = @fat_g
     WHERE food_id = @id`
  ).run({ ...food, id })

  return db.prepare('SELECT * FROM foods WHERE id = ?').get(id) as FoodRow
}

// Remove a food. Throws if the id doesn't exist, so the UI can't
// silently "succeed" at deleting nothing.
export function deleteFood(id: number): void {
  if (!db) throw new Error('[db] deleteFood() called before initDatabase()')
  const info = db.prepare('DELETE FROM foods WHERE id = ?').run(id)
  if (info.changes === 0) throw new Error(`No food with id ${id}`)
}


// ── Goals ───────────────────────────────────────────────────────────
export function getGoals(): Goals {
  if (!db) throw new Error('[db] getGoals() called before initDatabase()')
  return db
    .prepare('SELECT calories, protein_g, carbs_g, fat_g FROM goals WHERE id = 1')
    .get() as Goals
}

export function setGoals(goals: Goals): Goals {
  if (!db) throw new Error('[db] setGoals() called before initDatabase()')
  db.prepare(
    `UPDATE goals SET calories = @calories, protein_g = @protein_g,
       carbs_g = @carbs_g, fat_g = @fat_g WHERE id = 1`
  ).run(goals)
  return getGoals()
}

// ── Log ─────────────────────────────────────────────────────────────
function countLogEntries(): number {
  if (!db) return 0
  return (db.prepare('SELECT COUNT(*) AS n FROM log_entries').get() as { n: number }).n
}

export interface NewLogEntry {
  food_id: number
  date: string
  meal: MealType
}

// Copy the food's macros into the day. No scaling — a food IS one
// portion. The values are snapshotted so that deleting the food later
// can't erase what you ate.
export function addLogEntry(entry: NewLogEntry): LogEntry {
  if (!db) throw new Error('[db] addLogEntry() called before initDatabase()')

  const food = db.prepare('SELECT * FROM foods WHERE id = ?').get(entry.food_id) as
    | FoodRow
    | undefined
  if (!food) throw new Error(`No food with id ${entry.food_id}`)

  const info = db
    .prepare(
      `INSERT INTO log_entries
         (food_id, date, meal, grams, name, calories, protein_g, carbs_g, fat_g)
       VALUES
         (@food_id, @date, @meal, NULL, @name, @calories, @protein_g, @carbs_g, @fat_g)`
    )
    .run({
      food_id: food.id,
      date: entry.date,
      meal: entry.meal,
      name: food.name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g
    })

  return db
    .prepare('SELECT * FROM log_entries WHERE id = ?')
    .get(info.lastInsertRowid) as LogEntry
}

export function deleteLogEntry(id: number): void {
  if (!db) throw new Error('[db] deleteLogEntry() called before initDatabase()')
  const info = db.prepare('DELETE FROM log_entries WHERE id = ?').run(id)
  if (info.changes === 0) throw new Error(`No log entry with id ${id}`)
}

// Everything eaten on one day, in the order it was added.
export function listLogEntries(date: string): LogEntry[] {
  if (!db) throw new Error('[db] listLogEntries() called before initDatabase()')
  return db
    .prepare('SELECT * FROM log_entries WHERE date = ? ORDER BY id')
    .all(date) as LogEntry[]
}

// One day's totals. COALESCE turns the NULL that SUM returns over zero
// rows into 0, so the UI never has to special-case an empty day.
export function getDayTotals(date: string): DayTotals {
  if (!db) throw new Error('[db] getDayTotals() called before initDatabase()')
  return db
    .prepare(
      `SELECT ? AS date,
              COALESCE(SUM(calories), 0)  AS calories,
              COALESCE(SUM(protein_g), 0) AS protein_g,
              COALESCE(SUM(carbs_g), 0)   AS carbs_g,
              COALESCE(SUM(fat_g), 0)     AS fat_g
       FROM log_entries WHERE date = ?`
    )
    .get(date, date) as DayTotals
}

// Per-day totals across a range — the ONE query behind History and
// Trends. Days with no entries simply don't appear; the UI fills gaps.
export function getRangeTotals(from: string, to: string): DayTotals[] {
  if (!db) throw new Error('[db] getRangeTotals() called before initDatabase()')
  return db
    .prepare(
      `SELECT date,
              SUM(calories)  AS calories,
              SUM(protein_g) AS protein_g,
              SUM(carbs_g)   AS carbs_g,
              SUM(fat_g)     AS fat_g
       FROM log_entries
       WHERE date BETWEEN ? AND ?
       GROUP BY date
       ORDER BY date DESC`
    )
    .all(from, to) as DayTotals[]
}


// ── Daily check-in ──────────────────────────────────────────────────
// Always returns a row. A day with no check-in yet reads as empty rather
// than null, so the form has something to bind to on every date.
export function getDayStats(date: string): DayStats {
  if (!db) throw new Error('[db] getDayStats() called before initDatabase()')

  const row = db.prepare('SELECT * FROM day_stats WHERE date = ?').get(date) as
    | { date: string; weight_kg: number | null; steps: number | null; worked_out: number; notes: string | null }
    | undefined

  if (!row) {
    return { date, weight_kg: null, steps: null, worked_out: false, notes: null }
  }
  // 0/1 → boolean at the module boundary; the rest of the app never sees
  // SQLite's integer stand-in.
  return { ...row, worked_out: row.worked_out === 1 }
}

// Insert-or-update in one statement. ON CONFLICT(date) fires because
// `date` is the primary key, so saving the same day twice updates it
// instead of erroring.
export function saveDayStats(stats: DayStats): DayStats {
  if (!db) throw new Error('[db] saveDayStats() called before initDatabase()')

  db.prepare(
    `INSERT INTO day_stats (date, weight_kg, steps, worked_out, notes)
     VALUES (@date, @weight_kg, @steps, @worked_out, @notes)
     ON CONFLICT(date) DO UPDATE SET
       weight_kg  = excluded.weight_kg,
       steps      = excluded.steps,
       worked_out = excluded.worked_out,
       notes      = excluded.notes`
  ).run({ ...stats, worked_out: stats.worked_out ? 1 : 0 })

  return getDayStats(stats.date)
}


// A one-off entry: macros typed straight in, not drawn from the library.
// food_id and grams are null — there's no food to reference and no
// amount to scale, the numbers ARE the entry.
export interface ManualLogEntry {
  date: string
  meal: MealType
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export function addManualLogEntry(entry: ManualLogEntry): LogEntry {
  if (!db) throw new Error('[db] addManualLogEntry() called before initDatabase()')

  const info = db
    .prepare(
      `INSERT INTO log_entries
         (food_id, date, meal, grams, name, calories, protein_g, carbs_g, fat_g)
       VALUES
         (NULL, @date, @meal, NULL, @name, @calories, @protein_g, @carbs_g, @fat_g)`
    )
    .run(entry)

  return db.prepare('SELECT * FROM log_entries WHERE id = ?').get(info.lastInsertRowid) as LogEntry
}

// Every check-in in a date range. Only days that HAVE one are returned —
// History unions these with the food totals so a day with a weigh-in but
// no food logged still shows up.
export function getDayStatsRange(from: string, to: string): DayStats[] {
  if (!db) throw new Error('[db] getDayStatsRange() called before initDatabase()')

  const rows = db
    .prepare('SELECT * FROM day_stats WHERE date BETWEEN ? AND ? ORDER BY date DESC')
    .all(from, to) as {
    date: string
    weight_kg: number | null
    steps: number | null
    worked_out: number
    notes: string | null
  }[]

  return rows.map((r) => ({ ...r, worked_out: r.worked_out === 1 }))
}


// ── Profile ─────────────────────────────────────────────────────────
export function getProfile(): Profile {
  if (!db) throw new Error('[db] getProfile() called before initDatabase()')
  return db.prepare('SELECT username FROM profile WHERE id = 1').get() as Profile
}

export function setUsername(username: string): Profile {
  if (!db) throw new Error('[db] setUsername() called before initDatabase()')
  db.prepare('UPDATE profile SET username = ? WHERE id = 1').run(username)
  return getProfile()
}
