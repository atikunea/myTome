# Desktop verification checklist

`npm test` runs under `node`. It cannot see a window, a font, a clipboard or a
print dialog, and jsdom would not help. This file is the list that gets run by
hand instead — and, because macOS and Linux are on the roadmap, the list that
gets run **again** on each of them before either ships.

Record results at the bottom. A platform with no entry has not been checked,
which is not the same as working.

## Running it

```bash
npm run desktop:build   # vite build --mode desktop, then tsc for the shell
npx electron .          # the packaged path: mytome://app
```

For the dev loop, start the Vite server from the **myTome** launch config, then:

```bash
npm run desktop:dev
```

That loads `http://localhost:5173` instead of the custom scheme. **Dev and
packaged runs therefore have separate libraries** — different origins, different
IndexedDB. That is convenient rather than a bug, but it means a dev session
never shows you the real data, and a bug that only reproduces on one origin is
telling you something.

## What a machine can check

Launch with `npx electron . --remote-debugging-port=9222` and drive the renderer
over CDP (`http://localhost:9222/json` lists targets; Node 22+ has a global
`WebSocket`). Evaluating one expression in the page covers most of the lockdown:

| Check | Expect |
|---|---|
| `location.origin` | `mytome://app` — the scheme resolved and the handler served |
| `location.hash` | a real route, e.g. `#/tomes` — the router ran |
| `Object.keys(window.myTome)` | exactly the preload surface, nothing more |
| `typeof require / process / module / Buffer` | `undefined` on all four — sandbox, `contextIsolation`, no `nodeIntegration` |
| `navigator.storage.persisted()` | `true` — the permission handler granted durable storage |
| `indexedDB.databases()` | `myTomeDB` present |
| injecting an inline `<script>` | blocked — the CSP header is live |
| `[...document.fonts]` | four Gelasio faces, all `unloaded` where Georgia exists |
| `document.fonts.load("400 16px Gelasio")` | resolves — the woff2 is reachable over the scheme |
| `<userData>/IndexedDB/` on disk | one directory named after the origin |

**Do not leave a debugging port open beyond the check.** It is an unauthenticated
door into the renderer.

## What only a person at the window can check

Everything below is invisible to the probe above and to every test in the repo.

- [ ] **Lexical**: type, bold/italic, undo/redo, lists, links. Tab indents.
- [ ] **Clipboard in the editor**: cut, copy, paste, paste-and-match-style,
      select-all — **by keyboard**, not by menu. On macOS this is the one that
      catches a missing Edit role; see `docs/desktop-app.md`.
- [ ] **Drag and drop**: reorder plot beats, rows, write items.
- [ ] **Print**: a manuscript reaches the OS print dialog and the preview is
      white paper in both colour modes.
- [ ] **Images**: pick a cover, it renders, it survives a restart, and a
      `.indexeddb.blob` directory appears beside the leveldb one.
- [ ] **Restart**: the library is still there. Then restart again after a
      forced kill, which is the LevelDB recovery path.
- [ ] **Dark mode**: toggle, and confirm the window background matches rather
      than flashing white on launch.
- [ ] **Second instance**: launching again focuses the first window instead of
      opening a second (two processes on one LevelDB is how a library breaks).
- [ ] **External links**: the Help menu opens a browser, not a window inside
      the app.
- [ ] **Fonts**: the brand serif renders as intended — the check that matters
      on Linux, where Georgia does not exist.

## Results

### Windows 11 — phase 1 — 2026-09-19

Electron 44.4.3, Node 24.18.1, packaged path (`mytome://app`).

Machine-checked, all passing: origin `mytome://app`; route `#/tomes`; preload
surface exactly `isDesktop, platform, versions`; `require`/`process`/`module`/
`Buffer` all `undefined` in the renderer; `navigator.storage.persisted()` true;
`myTomeDB` created; an injected inline script blocked by the CSP; the app
rendered real content.

Fonts: all four Gelasio faces registered and all `unloaded`, which is the
intended result — Georgia exists here, so Windows never fetches a byte of the
bundled face. Forcing `document.fonts.load("400 16px Gelasio")` resolved with
one face, proving the woff2 is served correctly over `mytome://` and that the
`unicode-range` split works (only the `latin` file loaded). The Linux half of
this check — that Gelasio is what actually renders — cannot be run here.

On disk:
`%APPDATA%\myTome\IndexedDB\mytome_app_0.indexeddb.leveldb` — the directory
name derived from the origin, which is the concrete reason the scheme in
`desktop/main.ts` can never change.

No Electron security warnings on stdout, which is itself a check: Electron
prints them when `webPreferences` are unsafe.

**The manual list above has not been run.** Nothing in this session typed into
the editor, printed, dragged a beat or picked an image.

### macOS

Not run.

### Linux

Not run.
