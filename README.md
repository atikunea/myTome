# myTome

A local-first workspace for writing novels.

**[Open the web app →](https://atikunea.github.io/myTome/)**

An author creates **Tomes** (books), defines their own **element types**
(Character, Place, Faction — whatever the book needs) with custom fields, fills
them with **elements**, links those elements with **relationships**, lays out
**plots** as ordered beats aligned on a shared axis of rows, and writes the
prose itself in a rich-text editor. Manuscripts export to Word, or print to PDF
through the browser.

## There is no backend

No server, no API, no accounts, no sign-up. Everything lives in your browser's
IndexedDB, and the whole app is a static bundle. Nobody — including whoever
hosts it — can read what you write.

That has one consequence worth understanding before you rely on it: **your work
lives in one browser profile on one machine.** Clearing site data deletes it.
The Backup page is the only copy that survives that, so use it.

The single optional exception is **Google Drive sync**, which keeps backup files
in a folder in *your* Drive, talking to Google directly from the page. It is off
unless the build is given an OAuth client id, and a build without one has no
Drive UI at all. See [docs/google-drive-sync.md](docs/google-drive-sync.md).

## Requirements

- **Node 22 or newer** (CI builds on 22; developed on 24)
- npm

```bash
npm install
```

## The web app

```bash
npm run dev       # dev server on http://localhost:5173
npm run build     # type-check, then build to dist/
npm run preview   # serve the built dist/ on http://localhost:4173
```

## Tests

```bash
npm test          # one run
npm run test:watch
```

The suite runs under **`node`**, not a browser: it covers the data layer, the
pure logic modules and the Dexie migrations (against `fake-indexeddb`). There
are no component or page tests, and a green suite is not the same as a working
app — layout, focus, drag-and-drop and printing are only ever verified by
running it.

**The two gates are `npm run build` and `npm test`.** There is no linter or
formatter; match the surrounding style.

## The desktop app

> **Status: early.** The shell, Google Drive sync with a refresh token, and
> native open/save dialogs all work. Automatic backup export, code signing and
> auto-update are not built yet. Windows only so far; macOS and Linux are
> planned. The full design is in [docs/desktop-app.md](docs/desktop-app.md).

The desktop build is the *same* `src/` in an Electron shell. It differs from the
web build in four ways and no more: it loads from a `mytome://` scheme instead
of a URL subpath, it gets a stricter Content-Security-Policy as a real header,
its Google credentials live in the shell rather than in the page, and getting a
file in or out of it goes through a real OS dialog instead of a browser
download and a hidden `<input type="file">`.

**Its library is separate from the web app's** — a different origin means a
different IndexedDB. Moving work between them is a backup file or a Drive sync,
not something that happens by itself.

### Running it

```bash
npm run desktop:build   # build the renderer, then compile the shell
npm run desktop:start   # the above, then launch Electron
```

For a dev loop with hot reload, start the Vite server first and then point
Electron at it — two terminals:

```bash
npm run dev
```

```bash
npm run desktop:dev
```

Note that `desktop:dev` loads `http://localhost:5173`, so it has a **different
library again** from the packaged `mytome://` build. Handy for throwaway test
data; misleading if you forget.

### Packaging it

```bash
npm run desktop:package
```

Windows only for now. The first run downloads NSIS and 7-Zip tooling, so it
needs a network connection and a few minutes; later runs are quicker.

It writes to `release/`:

| | |
|---|---|
| `myTome Setup <version>.exe` | The installer. Per-user, so it never asks for an administrator, and the author chooses the directory. |
| `myTome-<version>-portable.exe` | No install at all — runs from wherever you put it. The easiest way to try it on another machine. |
| `win-unpacked/` | The app as a plain folder. `win-unpacked/myTome.exe` runs it without installing anything, which is what you want while testing. |

Both executables are around 112 MB, nearly all of it Electron.

**Version numbers come from `package.json`**, which is still `0.0.0`. Bump it
before handing a build to anyone, or every build will claim to be the same one
— and auto-update, when it arrives, compares exactly this.

Config is [desktop/builder.yml](desktop/builder.yml).

Packaging and `npm run dev` can run at the same time, but only because
`vite.config.ts` says so. On Windows a watcher handle on a directory blocks
renaming it, and packaging extracts Electron into `release/win-unpacked.tmp`
before renaming it into place — so with Vite watching the project root, this
failed with `EPERM … rename 'win-unpacked.tmp'` and nothing pointed at the dev
server. `release/` and `dist-electron/` are excluded from the watcher for that
reason; if you ever see that error, check what else is watching the folder.

> **These builds are unsigned.** Windows SmartScreen will warn anyone who
> downloads one, prominently. That is fine for your own machines and not fine
> for handing to someone else — see
> [docs/desktop-app.md](docs/desktop-app.md) for what signing involves.

Two lines in `builder.yml` are load-bearing rather than cosmetic, and both are
commented there: `productName` must stay exactly `myTome`, because it decides
where the library lives on disk, and `deleteAppDataOnUninstall` must stay
`false`, because `true` means uninstalling silently deletes every novel.

#### The icon

```bash
npm run desktop:icon
```

Renders `public/favicon.svg` into `build/icon.png`, which electron-builder
converts to the Windows `.ico`. It uses the Electron already installed rather
than an image library — Chromium renders the SVG and a hidden window is
captured.

`build/icon.png` is committed, so packaging never depends on having run this.
Run it when the favicon changes, and commit the result.

### Checking it

```bash
npm run desktop:check   # type-check the shell only
```

The shell is a separate TypeScript program, so `npm run build` never type-checks
it — a broken file under `desktop/` cannot block a web deploy.

After any change to the shell, work through
[docs/desktop-verification.md](docs/desktop-verification.md). Nothing in `npm
test` can see a window, a clipboard, a font or a print dialog.

## Deployment

`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages and is
**`workflow_dispatch` only** — pushing to `main` ships nothing, deliberately.

The site is served from the `/myTome/` subpath, which is why the router is a
`HashRouter`.

## Layout

```
src/models/      Data shapes; only db.ts declares the Dexie schema
src/services/    The data layer, behind the store.ts barrel
src/hooks/       Dexie live queries → React, autosave, object URLs
src/context/     App-wide state
src/pages/       One per route
src/components/  Reusable UI
src/lexical/     Custom editor nodes and plugins
desktop/         The Electron shell (main process, preload, menu)
docs/            Feature and setup documentation
```

## Documentation

- [AGENTS.md](AGENTS.md) — architecture, conventions and the rules that span
  files. Start here before changing anything.
- [docs/desktop-app.md](docs/desktop-app.md) — the desktop specification
- [docs/desktop-verification.md](docs/desktop-verification.md) — what to check
  by hand, per platform
- [docs/google-drive-sync.md](docs/google-drive-sync.md) — setting up optional
  Drive sync
- [docs/activity-tracker.md](docs/activity-tracker.md),
  [docs/focus-writing.md](docs/focus-writing.md) — feature notes
