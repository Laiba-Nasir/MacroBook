<div align="center">
  <img src="src/renderer/src/assets/macrobook-logo.png" width="320" alt="MacroBook">
  <p><strong>A local-first desktop nutrition tracker.</strong></p>
</div>

Log what you eat, track macros against daily goals, and record how the day
actually felt — weight, steps, workouts and notes. Everything is stored in a
single SQLite file on your own machine.

**There is no account, no server, and no network access.** Nothing you type
leaves your computer.

## Screens

| | |
|---|---|
| **Today** | Calories, protein, carbs and fat against your goals, the day's log, and a daily check-in. Navigate to any past day. |
| **Foods** | Your library — add, edit, delete and search. |
| **History** | Past days with on-goal / over / under status, and your check-ins. |
| **Trends** | Calories vs goal, weight over time, steps and workouts, average macro split. |
| **Goals** | Your name and daily targets, with a calorie-split breakdown. |

Light and dark themes are both supported.

## Install

Download the installer for your platform from the
[Releases page](../../releases).

| Platform | File |
|---|---|
| macOS (Apple Silicon & Intel) | `MacroBook-x.y.z.dmg` |
| Windows | `MacroBook-x.y.z-setup.exe` |
| Linux | `MacroBook-x.y.z.AppImage` |

### ⚠️ The app is not code-signed

Signing certificates cost money, so the builds are unsigned. Your OS will warn
you the first time. This is expected, and here's how to get past it.

**macOS** — "MacroBook is damaged and can't be opened" is what macOS says
about *any* unsigned downloaded app. Either:

1. **Right-click** the app in Applications → **Open** → **Open** again, or
2. Run once in Terminal:
   ```bash
   xattr -dr com.apple.quarantine /Applications/MacroBook.app
   ```

**Windows** — SmartScreen shows "Windows protected your PC". Click
**More info** → **Run anyway**.

If you'd rather not bypass these warnings, build it yourself from source
(below). That's the point of it being open.

## Where your data lives

One SQLite file. Back it up or delete it freely:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/macrobook/macrobook.db` |
| Windows | `%APPDATA%\macrobook\macrobook.db` |
| Linux | `~/.config/macrobook/macrobook.db` |

Uninstalling the app does not remove this folder. Delete it by hand to start
completely fresh.

## Build from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/Laiba-Nasir/MacroBook.git
cd MacroBook
npm install
npm run dev
```

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Run in development with hot reload |
| `npm run typecheck` | Type-check main, preload and Svelte |
| `npm run build` | Type-check and compile |
| `npm run build:unpack` | Build an unpackaged app into `dist/` (fast) |
| `npm run build:mac` / `:win` / `:linux` | Build a distributable installer |

## How it's built

- **Electron** — desktop shell
- **Svelte 5 + TypeScript** — UI, in runes mode
- **Vite** via `electron-vite` — build tooling
- **better-sqlite3** — synchronous SQLite. A Node-API addon, so it needs no
  native rebuild step on any platform.

### Architecture

All database code lives in the **main** process. The renderer never touches
SQLite, the filesystem, or Node — it reaches main only through a fixed
allowlist of named functions exposed over `contextBridge`:

```
Svelte  →  window.api.listFoods()      (renderer: Chromium, no Node)
           ─────── process boundary ───────
        →  ipcMain.handle('foods:list') (main: Node, full privileges)
        →  SELECT * FROM foods
```

Generic `ipcRenderer` is deliberately **not** exposed. Every capability the UI
has is a function someone chose to add to `src/preload/index.ts`.

```
src/main/       db.ts (all SQL) · index.ts (windows, lifecycle, IPC handlers)
src/preload/    index.ts (the bridge) · api.d.ts (its type contract)
src/renderer/   App.svelte · components/ · theme.ts
```

## Releasing

Pushing a version tag builds all three platforms and drafts a GitHub Release:

```bash
npm version patch      # or minor / major
git push --follow-tags
```

## License

[MIT](LICENSE) © 2026 Laiba Nasir
