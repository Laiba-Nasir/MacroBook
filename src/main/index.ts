import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  initDatabase,
  listFoods,
  addFood,
  updateFood,
  deleteFood,
  getProfile,
  setUsername,
  getGoals,
  setGoals,
  addLogEntry,
  addManualLogEntry,
  deleteLogEntry,
  listLogEntries,
  getDayTotals,
  getRangeTotals,
  getDayStats,
  getDayStatsRange,
  saveDayStats,
  todayISO
} from './db'
import type { NewFood, Goals, NewLogEntry, ManualLogEntry, MealType, DayStats } from './db'   

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    // Sized for the sidebar + content layout in the Figma. minWidth stops
    // the user shrinking it until the nav and the macro cards collide —
    // the sizing problem you flagged.
    width: 1180,
    height: 800,
    minWidth: 940,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

   // ── Phase 1 ──────────────────────────────────────────────────────
  // Open the database before the first window exists.
  // WHY here and not at the top of the file: app.getPath('userData')
  // depends on Electron being initialized. Inside whenReady() is the
  // earliest point that's guaranteed safe.
  // WHY before createWindow(): once the UI can ask for data (Phase 2),
  // the DB must already be open. Ordering it now avoids a race later.
  initDatabase()

   // ── IPC: the renderer's ONLY route to food data ───────────────────
  // ipcMain.handle registers a request/response channel. Whatever the
  // callback returns is sent back to the caller's invoke() promise.
  //
  // Channel names are just strings, so a "namespace:verb" convention
  // keeps them from colliding as the app grows.
  //
  // Registered BEFORE createWindow() on purpose: once a window exists
  // it can start invoking immediately, and invoking an unregistered
  // channel is an error, not a queued call.
  ipcMain.handle('foods:list', () => {
    console.log('[ipc] foods:list requested')
    return listFoods() // plain objects — serializable across the boundary
  })

  // ── Validation ────────────────────────────────────────────────────
  // The renderer is the UNTRUSTED side of this boundary, even though we
  // wrote it. Every payload is re-checked here before it reaches SQL.
  // Shared by foods:add and foods:update so the rules can't drift apart.
  const validateFood = (input: NewFood): NewFood => {
    const name = String(input?.name ?? '').trim()
    if (!name) throw new Error('Name is required')

    // Number('') is 0 and Number(undefined) is NaN, so isFinite is the
    // real gate — an empty box must fail, not become zero.
    const num = (value: unknown, label: string): number => {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number of 0 or more`)
      return n
    }

    const food: NewFood = {
      name,
      calories: num(input?.calories, 'Calories'),
      protein_g: num(input?.protein_g, 'Protein'),
      carbs_g: num(input?.carbs_g, 'Carbs'),
      fat_g: num(input?.fat_g, 'Fat')
    }

    return food
  }

  // The UNIQUE constraint on name surfaces as a raw SQLite error.
  // Translate it into something a person can read.
  const friendly = (err: unknown, name: string): Error => {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return new Error(`"${name}" is already in your foods`)
    }
    return err instanceof Error ? err : new Error(String(err))
  }

  const requireId = (value: unknown): number => {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid food id')
    return id
  }

  ipcMain.handle('foods:add', (_event, input: NewFood) => {
    const food = validateFood(input)
    try {
      return addFood(food)
    } catch (err) {
      throw friendly(err, food.name)
    }
  })

  ipcMain.handle('foods:update', (_event, rawId: unknown, input: NewFood) => {
    const id = requireId(rawId)
    const food = validateFood(input)
    try {
      return updateFood(id, food)
    } catch (err) {
      throw friendly(err, food.name)
    }
  })

  ipcMain.handle('foods:delete', (_event, rawId: unknown) => {
    deleteFood(requireId(rawId))
  })

  // ── Profile ───────────────────────────────────────────────────────
  ipcMain.handle('profile:get', () => getProfile())

  ipcMain.handle('profile:setUsername', (_event, raw: unknown) => {
    // Trimmed, length-capped, and required. This string is rendered in
    // the sidebar, so an empty or absurd value is the UI's problem.
    const username = String(raw ?? '').trim().slice(0, 40)
    if (!username) throw new Error('Name is required')
    return setUsername(username)
  })

  // ── Phase 6: goals ────────────────────────────────────────────────
  ipcMain.handle('goals:get', () => getGoals())

  ipcMain.handle('goals:set', (_event, input: Goals) => {
    const num = (value: unknown, label: string): number => {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number of 0 or more`)
      return n
    }
    const goals: Goals = {
      calories: num(input?.calories, 'Calorie target'),
      protein_g: num(input?.protein_g, 'Protein target'),
      carbs_g: num(input?.carbs_g, 'Carb target'),
      fat_g: num(input?.fat_g, 'Fat target')
    }
    if (goals.calories <= 0) throw new Error('Calorie target must be greater than 0')
    return setGoals(goals)
  })

  // ── Phase 7: the daily log ────────────────────────────────────────
  // Main owns "what day is it" so the UI and the database can never
  // disagree about the date boundary.
  ipcMain.handle('log:today', () => todayISO())

  const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
  // 'YYYY-MM-DD' only — this string goes straight into a WHERE clause as
  // a bound parameter, and a malformed date would silently match nothing.
  const requireDate = (value: unknown): string => {
    const date = String(value ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date')
    return date
  }

  ipcMain.handle('log:add', (_event, input: NewLogEntry) => {
    const meal = String(input?.meal) as MealType
    if (!MEALS.includes(meal)) throw new Error('Invalid meal')

    return addLogEntry({
      food_id: requireId(input?.food_id),
      date: requireDate(input?.date),
      meal
    })
  })

  // A one-off entry with macros typed directly — no library food.
  ipcMain.handle('log:addManual', (_event, input: ManualLogEntry) => {
    const name = String(input?.name ?? '').trim()
    if (!name) throw new Error('Name is required')

    const meal = String(input?.meal) as MealType
    if (!MEALS.includes(meal)) throw new Error('Invalid meal')

    const num = (value: unknown, label: string): number => {
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number of 0 or more`)
      return n
    }

    return addManualLogEntry({
      date: requireDate(input?.date),
      meal,
      name,
      calories: num(input?.calories, 'Calories'),
      protein_g: num(input?.protein_g, 'Protein'),
      carbs_g: num(input?.carbs_g, 'Carbs'),
      fat_g: num(input?.fat_g, 'Fat')
    })
  })

  ipcMain.handle('log:delete', (_event, rawId: unknown) => {
    deleteLogEntry(requireId(rawId))
  })

  ipcMain.handle('log:listDay', (_event, date: unknown) => listLogEntries(requireDate(date)))

  ipcMain.handle('log:dayTotals', (_event, date: unknown) => getDayTotals(requireDate(date)))

  ipcMain.handle('log:rangeTotals', (_event, from: unknown, to: unknown) =>
    getRangeTotals(requireDate(from), requireDate(to))
  )

  // ── Daily check-in ────────────────────────────────────────────────
  ipcMain.handle('dayStats:get', (_event, date: unknown) => getDayStats(requireDate(date)))

  ipcMain.handle('dayStats:range', (_event, from: unknown, to: unknown) =>
    getDayStatsRange(requireDate(from), requireDate(to))
  )

  ipcMain.handle('dayStats:save', (_event, input: DayStats) => {
    // Every field is optional, so the rule is "blank or valid" rather
    // than "required". null means "not recorded", which is different
    // from zero.
    const optionalNum = (value: unknown, label: string, max: number): number | null => {
      if (value === null || value === undefined || value === '') return null
      const n = Number(value)
      if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number of 0 or more`)
      if (n > max) throw new Error(`${label} looks wrong — ${max} is the maximum`)
      return n
    }

    const notes = input?.notes == null ? null : String(input.notes).slice(0, 2000)

    return saveDayStats({
      date: requireDate(input?.date),
      weight_kg: optionalNum(input?.weight_kg, 'Weight', 1000),
      steps: optionalNum(input?.steps, 'Steps', 200000),
      worked_out: Boolean(input?.worked_out),
      notes: notes && notes.trim() ? notes : null
    })
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
