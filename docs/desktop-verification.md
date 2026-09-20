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

A running instance holds a single-instance lock, so a second copy quits
immediately and the probe finds no target. Give the probe its own library with
`--user-data-dir=<a scratch path>` rather than closing the author's app — and
remember that a run under that flag starts with an empty library.

The native dialogs can be driven too, which is the only way to check them
without a person at the window. Issue the call without awaiting it, park the
promise on `window`, drive the dialog from the OS side — on Windows,
`SetForegroundWindow` on the dialog's `hwnd`, then `Alt+N` to reach the
filename field, then the path and `Enter` — and read the promise back
afterwards. **`AppActivate` on the process id is not enough**: it raises the
main window, and the keystrokes then go to the page instead of the dialog.

| Check | Expect |
|---|---|
| `Object.keys(window.myTome.files)` | exactly `open, save` |
| a save, driven to a path you chose | the bytes at that path, and `{ saved: true, name }` — a **name**, never a path |
| a save, cancelled | `{ saved: false }`, no error, and the page says nothing |
| an open, driven to a file you chose | `{ name, bytes }`, and the page's own parse of it succeeds |

**The folder picker needs a different trick.** Its "Select Folder" button does
not answer `Enter`, `Alt`-accelerators or a synthetic mouse click, and UI
Automation sees only a `Pane` with no invokable pattern. What works is the
plain Win32 route: `EnumChildWindows` on the dialog, find the child whose
`GetDlgCtrlID` is `1`, and send it `BM_CLICK` (`0x00F5`). Typing the path
first *does* land — the "Folder:" field holds it — so only the commit needs
this.

Automatic backup export is checkable end to end, and `localStorage` is where
most of its state is:

| Check | Expect |
|---|---|
| `Object.keys(window.myTome.backup)` | exactly `chooseFolder, folder, forgetFolder, write` |
| `window.myTome.backup.folder()` on a fresh profile | `undefined`, and `myTome.autoExport.*` absent — it is off until a folder is picked |
| picking a folder | one file appears at once, named `myTome-backup-<date>-<HHMM>.json` in **local** time |
| reloading with nothing changed | no new file — the change gate, not the clock |
| changing a tome, back-dating `lastExportAt`, reloading | one new file |
| seeding older auto-named files and lowering "files to keep" | the oldest automatic files removed, down to the count |
| a hand-saved `myTome-backup-<date>.json` (no time) in the same folder | **never** deleted, whatever the retention |
| moving the folder away, then "Back up now" | a sentence, not an `errno`, and the schedule paused |
| putting the folder back, then "Back up now" | writes, and the error clears |
| "Stop" | the card goes back to "Choose a folder…", and every file already written is still there |

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
- [ ] **Dialogs**: the save dialog opens on a sensible filename with the right
      file type selected, and the open dialog is filtered to what the caller
      asked for. On macOS both are **sheets attached to the window**, not
      free-floating panels that can be lost behind the app — `desktop/files.ts`
      passes the parent window for exactly that reason.
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
- [ ] **Automatic backup export, left running for a real writing session**:
      files appear on the interval and only after something changed, and the
      app never stutters while a manuscript-sized library is serialised. The
      probe above can force a write; it cannot tell you whether a 200 MB
      library freezes the editor for a second every half hour.

## After packaging

`npm run desktop:package` changes how the app finds its own files: the renderer
is read from inside `app.asar` rather than from `dist/` on disk. Run the whole
list above against the installed build, not only against `npx electron .`, and
add these:

- [ ] **The packaged app loads at all.** A blank window means the protocol
      handler could not read the renderer out of the asar — the fix is
      `asarUnpack` for `dist/`, not a change to `main.ts`.
- [ ] **The library survives an upgrade.** Install, write something, install
      again over the top, and confirm the work is still there. This is what
      catches a changed `productName`, which silently repoints `userData`.
- [ ] **Uninstalling does not delete the library.** `deleteAppDataOnUninstall`
      is `false` in `desktop/builder.yml`; confirm that `%APPDATA%\myTome`
      still exists afterwards. Reinstalling should find the work again.
- [ ] **The portable exe and the installed app share one library** — both
      resolve the same `userData` — and running one while the other is open
      hands focus over rather than opening a second window.
- [ ] **The icon** is the book mark in Explorer, the taskbar and the installer.

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

### Windows 11 — packaging — 2026-09-19

electron-builder 26.15.3. Produced `myTome Setup 0.0.0.exe` (112 MB) and
`myTome-0.0.0-portable.exe` (111.8 MB).

The packaged app was probed exactly as the dev build was, and matched it on
every point: origin `mytome://app`, route `#/tomes`, the same preload surface,
no Node globals in the renderer, an inline script blocked by the CSP, durable
storage granted.

**The asar question is settled.** `protocol.handle` + `net.fetch` reads the
renderer directly out of `app.asar`; no `asarUnpack` was needed and
`desktop/main.ts` required no change for packaging. The packaged app also
opened the *same* library the from-source runs had created, which confirms
`productName: myTome` keeps `userData` where it was.

Not checked: installing via the NSIS installer, upgrading over an existing
install, uninstalling, and the icon in Explorer. The whole **After packaging**
list above is still outstanding — these artifacts were run unpacked, not
installed.

**One trap worth recording, because it cost an hour and pointed nowhere near
its cause.** Packaging failed five times with `EPERM … rename
'release\win-unpacked.tmp' -> 'release\win-unpacked'`, and the one build that
succeeded was the one writing to `%TEMP%`. The cause was a `npm run dev` in
another terminal: Vite watches the project root, a watcher handle on a
directory blocks renaming it on Windows, and packaging extracts Electron into
`win-unpacked.tmp` before renaming it into place.

What made it misleading is that renaming an equivalent directory *by hand* in
the same folder works — because that finishes in milliseconds, before the
watcher registers the new directory, while the extraction takes ten seconds or
more. `vite.config.ts` now excludes `release/` and `dist-electron/` from the
watcher, verified by packaging successfully with the dev server running.

### Windows 11 — phase 3 (native file dialogs) — 2026-09-20

Electron 44.4.3, packaged path (`mytome://app`), run under its own
`--user-data-dir` because the portable build from the packaging session was
still open and held the single-instance lock.

Bridge surface: `drive, files, isDesktop, platform, versions`, and
`window.myTome.files` is exactly `open, save`. `require`, `process` and
`module` are still `undefined` in the renderer — the new channels added no
Node.

All four call sites were driven through the UI, not through the bridge:

- **Backup export.** `/backup` → "Download backup" opened a Save As dialog,
  the file was written where it was pointed (7,858 bytes, valid backup JSON),
  and the page reported *"Saved 1 tome to phase3-library.json."* — the name the
  dialog returned, not the suggested one. The promise resolved to
  `{ saved: true, name: "phase3-library.json" }`, with no path anywhere in it.
- **Restore.** "Choose backup file…" opened a filtered Open dialog; picking
  that file gave `RestoreDialog` the filename and a parsed summary
  ("1 tome … Phase Three, 0 elements · 1 plot · 0 texts"), so the bytes crossed
  IPC, became a `Blob` with a type, and `parseBackup` read them.
- **Cover image.** The picker's "Upload an image" opened a filtered dialog; the
  chosen PNG previewed at its real 343×361, saved, and **still rendered after a
  reload** — so the reconstructed `Blob` carried `image/png` into Dexie rather
  than `application/octet-stream`.
- **Manuscript `.docx`.** A chapter was typed into Lexical on a beat, and
  "Download .docx" produced a 23,595-byte file whose `word/document.xml`
  contains both the beat title and the typed sentence.

The web half was driven too, on `npm run dev`: the download reported the
suggested name, left no `<a download>` behind in the DOM, and wrote bytes; the
picker built one transient `<input type="file">` per call, and a `cancel` on it
removed the element and settled the promise with no error and no dialog.

Two things found on the way, neither a phase-3 regression:

- **`connect-src 'self'` blocks `fetch()` on a `blob:` URL** in the desktop
  build. Nothing in the app does that — `fetch` lives only in `drive.ts`, and
  images go to `<img src>`, which `img-src blob:` allows — but a future caller
  would hit it, and the failure is a CSP console error rather than an
  exception the code can catch.
- **"Download .docx" is disabled when the manuscript has no beats with prose**,
  which is correct and easy to misread as a hang: a `click()` on a disabled
  button reports success and does nothing.

Still not run here: the `cancel` path of a *desktop* save (the code is the same
`canceled` branch the open path took), and everything under **After packaging**
— these ran from source, not from an installed build.

### Windows 11 — phase 4 (automatic backup export) — 2026-09-20

Electron 44.4.3, packaged path (`mytome://app`), again under its own
`--user-data-dir`.

Bridge: `backup, drive, files, isDesktop, platform, versions`, and
`window.myTome.backup` is exactly `chooseFolder, folder, forgetFolder, write`.
On first look `backup.folder()` was `undefined` and neither
`myTome.autoExport.settings` nor `myTome.autoExport.state` existed — off until
a folder is chosen, with nothing written and nothing remembered.

Driven through the card on `/backup`:

- **Choosing a folder** wrote one file immediately:
  `myTome-backup-2026-09-20-0930.json`, 26,753 bytes, parsing as
  `myTome-backup` v3 / schema 12 with both tomes in it. The card switched to
  "On", showed the path, and reported the filename back.
- **A launch tick with nothing changed wrote nothing.** Reloading fired a real
  scheduled run — not the forced button — and the folder still held one file.
  That is the change gate, and it is the behaviour that keeps an idle day from
  costing ten files.
- **A changed library past its interval wrote once.** Adding a tome,
  back-dating `lastExportAt` by an hour and reloading produced a second file
  and nothing more.
- **Retention deleted only its own.** With the folder seeded with two older
  auto-named files, a hand-saved `myTome-backup-2026-09-19.json`, a one-tome
  `myTome-phase-three-2026-09-19.json` and a `notes.txt`, setting "files to
  keep" to 3 and writing once left exactly three automatic files — and all
  three decoys untouched. The hand-saved file has no `-HHMM`, so it cannot
  match the pruner's pattern.
- **A missing folder is a sentence, not an `errno`.** Moving the folder away
  and pressing "Back up now" gave *"The backup folder is no longer there:
  C:\…"* and paused the schedule. Putting it back and pressing again wrote,
  cleared the error and resumed. The first attempt showed Electron's own
  `Error invoking remote method 'backup:write': Error: …` wrapper, which
  `backupTransport.desktop.ts` now strips — these messages are read by an
  author, and an IPC channel name in front of one is noise about our plumbing.
- **"Stop" stops and keeps.** The card returned to "Choose a folder…",
  `backup.folder()` went back to `undefined`, and all six files in the folder
  were still there.

On the web, `/backup` showed the four original cards, no "Keep a copy in a
folder", no `myTome.autoExport.*` keys and `window.myTome` undefined. Grepping
both bundles: the desktop bundle carries no "part of the desktop app" refusal
and the web bundle carries no bridge string — the card component itself ships
in both, which is correct, because it is the transport that differs and the
card simply returns `null`.

Two things worth knowing:

- **"Back up now" twice inside one minute overwrites**, because the name has
  minute resolution. Harmless — both files are the current library — and
  unreachable from the schedule, whose minimum interval is five minutes.
- **A pause does not survive a restart.** A launch tick will try the broken
  folder once more and pause again. That is once per launch, not a loop, and
  it is how the app notices that a drive came back.

### macOS

Not run.

### Linux

Not run.
