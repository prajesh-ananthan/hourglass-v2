# ⏳ Hourglass

A simple, beautiful, **standalone countdown timer** for **Windows 11** and **macOS**.

Hourglass is a cross-platform desktop app inspired by the classic
[dziemborowicz/hourglass](https://github.com/dziemborowicz/hourglass)
(which is Windows-only). This version is built with
[Electron](https://www.electronjs.org/) so it runs natively on both Windows and
Mac from a single codebase, and installs as a real standalone application — no
runtime or browser required.

## Features

- **Natural-language time input** — type a duration or a target time and press Start:
  - Durations: `5`, `90`, `5:30`, `1:30:00`, `10m`, `1h 30m`, `1.5 hours`, `90 seconds`, `2 days`
  - Times of day: `5:30 pm`, `7pm`, `noon`, `midnight`, `17:30`
  - Dates: `2026-12-31 15:00`, `December 31 2026`
- **Live preview** of what your input will be interpreted as, before you start.
- **Full timer controls** — pause / resume, stop, add a minute, and reset.
- **Progress bar** that fills the whole window as time elapses.
- **Countdown in the window title** so you can see it from the taskbar / Dock.
- **Finish alarm** — a pleasant chime (optionally looping) synthesised in-app.
- **Pop-up when finished** — the window comes to the front and flashes.
- **Always on top** toggle to keep the timer visible.
- **Light / dark / system themes.**
- **Custom titles** for each timer, and **quick presets / recent inputs**.
- **Multiple timer windows** (File → New Timer Window / `Ctrl`/`Cmd`+`N`).
- **Settings persist** between launches.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Enter` | Start the timer |
| `Space` | Pause / resume |
| `Esc` | Stop / reset (or close settings) |
| `Ctrl`/`Cmd` + `.` | Stop |
| `Ctrl`/`Cmd` + `=` | Add one minute |
| `Ctrl`/`Cmd` + `N` | New timer window |

## Running from source

Requires [Node.js](https://nodejs.org/) 18+.

```bash
npm install       # install Electron + build tooling
npm start         # generate the icon (first run) and launch the app
npm test          # run the time-parser unit tests
```

> The app icon is generated from `scripts/gen-icon.cjs` (Node standard library
> only — no extra dependencies) via the `prestart` / `predist` npm hooks, so it
> is produced automatically the first time you run or build. You can also
> regenerate it on demand with `npm run icons`.

## Building standalone installers

Packaging uses [electron-builder](https://www.electron.build/).

```bash
# Build for the platform you're currently on
npm run dist

# Or target a specific platform (build on that OS for best results)
npm run dist:win   # Windows 11 → NSIS installer + portable .exe (x64 & arm64)
npm run dist:mac   # macOS      → .dmg + .zip (Intel & Apple Silicon)
```

Output installers are written to the `release/` directory.

> **Note on cross-compiling:** Windows targets are best built on Windows and
> macOS targets on macOS. electron-builder can produce a Windows build from
> other platforms if Wine is available, but native `.dmg`/code-signed builds
> require macOS.

## Project structure

```
hourglass-v2/
├── src/
│   ├── main.js            # Electron main process (windows, menu, IPC, settings)
│   ├── preload.js         # Secure bridge between main and renderer
│   ├── timeParser.js      # Natural-language time/duration parsing (shared, tested)
│   └── renderer/
│       ├── index.html     # UI markup
│       ├── styles.css     # Theme-aware styling
│       └── renderer.js    # Timer logic, controls, sound, settings
├── test/parser.test.js    # Dependency-free unit tests for the parser
├── scripts/gen-icon.cjs   # Generates the app icon (Node stdlib only)
└── package.json           # Scripts + electron-builder config
```

The app icon (`build/icon.png`, from which electron-builder derives the Windows
`.ico` and macOS `.icns`) is generated at build time and is not committed.

## How it works

- The **main process** owns persistent settings (stored as JSON in the OS
  user-data directory), the application menu, and window management. It also
  handles the "pop up when finished" behaviour (`show`, `focus`, `flashFrame`)
  and the always-on-top toggle.
- The **renderer** runs the countdown using `requestAnimationFrame` against an
  absolute end timestamp (so it stays accurate even if a frame is dropped),
  draws the display and progress, and plays the finish chime via the Web Audio
  API — meaning no external sound file is bundled.
- `contextIsolation` is on and `nodeIntegration` is off; the renderer talks to
  the main process only through the small, allow-listed `preload.js` bridge.

## License

[MIT](LICENSE)
