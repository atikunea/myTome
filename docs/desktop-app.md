# The desktop app — specification

myTome ships today as a static bundle on GitHub Pages. This is a spec for a
second artifact built from the same `src/`: an installed Windows application,
shipped alongside the web app and never replacing it.

**The reason it exists is Drive.** The web app's Google token lives in memory
for about an hour and there is no refresh token, because a browser page cannot
hold one safely and there is no server to hold it for us. An installed
application can: Google's installed-app OAuth flow issues a refresh token, and
Windows gives us a place to keep it that a web page does not have. That single
change turns "press Sync, consent again, wait" into an app that is simply
signed in — **without a backend appearing anywhere.** Durable storage, native
file dialogs and a shareable installer come along with it, but they are not why
we are doing this.

## Scope

**In:**

- A Windows desktop build of the existing app, same `src/`, no forked UI.
- Google Drive with a refresh token, silent re-authorization, and sync that can
  run without a click.
- Automatic backup export to a folder the author picks.
- Native open/save dialogs for backups, manuscripts and cover images.
- A signed installer with auto-update.

**Out, deliberately:**

- macOS and Linux **in v1**. They are confirmed roadmap targets rather than
  speculation, which is why several decisions below are made for three
  platforms even though only one ships first. What is out is building, testing
  and shipping them now.
- Any change to how the library is stored. Dexie and IndexedDB remain the
  source of truth, and every rule in `services/` stands untouched.
- Any change to the web app's Drive flow. It keeps the pop-up token client it
  has now.
- A server, of any kind, anywhere. See *The main process is not a backend*.

## Why Electron

The app is Electron. The short version: the renderer stays Chromium, which is
the engine every existing behaviour was developed and verified against.

The four places this app touches the platform decide it:

1. **IndexedDB with `Blob` values.** Cover images are stored as blobs
   (`services/images.ts`). Chromium handles that; WebKit has historically been
   the weak spot for exactly this.
2. **`window.print()` is the PDF export.** `AGENTS.md` says there is no PDF
   library and there should not be one — PDF is the browser's print dialog over
   `ManuscriptPrint`. That API must exist.
3. **Lexical's contenteditable and selection handling** is the heart of the
   Write editor and the most engine-sensitive code in the app.
4. **A `node`-only test suite** cannot see any of the above. Whatever engine we
   ship on, nothing in `npm test` will warn us when it misbehaves.

**Tauri was considered and is out.** On Windows alone it would be close —
WebView2 *is* Chromium, so points 1–3 would cost nothing today, and the
installer would be ~5 MB against Electron's ~120 MB. But macOS and Linux are
confirmed targets, and Tauri would put the app on WKWebView and WebKitGTK,
where **`window.print()` is not implemented at all.** That is not a bug to fix
later; it is PDF export gone on two platforms out of three, with the only
remedy being the PDF library `AGENTS.md` forbids. Point 4 means we would not
even get a failing test out of it. It would also add a Rust toolchain to a repo
whose two gates are `tsc` and `vitest`.

**The cost we are accepting:** a ~120 MB installer, and an obligation to ship
Electron upgrades. A stale Electron is a stale Chromium with published CVEs;
see *Maintenance*.

## What the other two platforms change now

Good news first, because it bounds the work: **the app code is already
cross-platform clean.** The only two modifier-key checks in `src/`
(`FocusSurface.tsx:154`, `TabKeyPlugin.tsx:44`) test `ctrlKey || metaKey`
together as "any modifier, bail out" guards rather than binding a shortcut, so
there is no Cmd-versus-Ctrl port to do. The sans and mono stacks in
`manuscriptStyles.ts` already carry `-apple-system`, `Menlo` and
`'Liberation Mono'`. Phase 1 should stay boring on all three.

Three things do not survive the trip, and each is cheapest to settle now:

- **The brand serif does not exist on Linux.** `theme.ts` sets
  `brandFontFamily` to `"Georgia, 'Times New Roman', serif"`, and neither font
  ships on most distributions — they are Microsoft core fonts, not free ones.
  On Linux the app falls back silently to whatever generic `serif` resolves to.
  That is cosmetic everywhere except `ManuscriptPrint`, where
  `manuscriptStyles.ts` records a measured calibration ("about 64 in serif and
  59 in mono") taken against Georgia — a different serif quietly moves the line
  width the author chose. **Bundle the serif and put it first in the stack.**
  The CSP already allows `font-src 'self'`, and this fixes the web app on Linux
  at the same time.
- **The macOS application menu.** Electron's *default* menu carries the Edit
  roles; the custom menu a writing app wants would replace it, and a custom
  menu missing those roles means **Cmd+C/V/X/A stop working inside the Write
  editor**. A handful of lines, invisible until someone runs it on a Mac, so
  write the menu in phase 1. See *The macOS Edit menu* below.
- **`app.getPath("userData")` is three paths**, not one: `%APPDATA%/myTome`,
  `~/Library/Application Support/myTome`, `~/.config/myTome`. The privacy page
  names where the library lives, so it names all three or names none of them
  specifically.

### The macOS Edit menu

Worth the extra paragraphs, because the failure is invisible on the platform we
develop on and lands in the middle of the Write editor.

On Windows and Linux, Ctrl+C in a text field is Chromium's business: the
keystroke reaches the web contents, Chromium recognises a copy command, done.
Nothing else is involved.

macOS does not work that way. Cmd+C is a **menu key equivalent**. Pressing it
makes AppKit walk the application menu bar — the strip at the top of the screen
— looking for an item that claims Cmd+C, normally *Edit → Copy*, and fire that
item's action. That action is what performs the copy. **If no menu item claims
the keystroke, nothing happens.** It is swallowed.

Electron knows this, which is why it installs a default application menu
carrying the Edit roles when we set none — that default is why a fresh Electron
app has working clipboard shortcuts on a Mac without anyone thinking about it.

The trap is that **`Menu.setApplicationMenu()` replaces the default outright;
it does not merge.** We will call it, because a writing app wants menus: File
(New Tome, Export Manuscript, Back Up Now, Choose Export Folder), View (focus
mode, prose face, zoom), Help (the guide, the privacy page). The moment that
menu is installed without an Edit submenu, **Cmd+C, Cmd+V, Cmd+X, Cmd+A and
Cmd+Z stop working everywhere in the app**, the Lexical editor included.
`setApplicationMenu(null)`, for a cleaner window, does the same thing.

Three facts about this project stack badly here: we develop on Windows, where
the failure cannot occur; `npm test` is `node`-only and cannot see it; and it
surfaces in the prose editor of a writing app, where copy and paste is not a
peripheral feature. The realistic path to discovering it is a Mac author
reporting that they cannot copy a paragraph.

The fix is small, because Electron's `role` values carry the correct
accelerator and action for each platform — no shortcut wiring, no clipboard
code of our own:

```
{
  label: "Edit",
  submenu: [
    { role: "undo" }, { role: "redo" },
    { type: "separator" },
    { role: "cut" }, { role: "copy" }, { role: "paste" },
    { role: "pasteAndMatchStyle" },
    { role: "selectAll" },
  ],
}
```

`pasteAndMatchStyle` (Cmd+Shift+V) earns its place here specifically: the paste
target is a rich-text Lexical editor and the source is very often a web page.

## The main process is not a backend

`AGENTS.md` opens with "There is no backend," and that stays true — but it
needs a sentence the way `drive.ts` already has one, because the desktop build
adds a process that is not the renderer.

**The main process may do exactly four things:** own the window, talk to the OS
(dialogs, credential store, paths, printing), hold Google tokens and attach
them to requests, and write backup files that `backup.ts` produced. It holds no
application state, knows nothing about tomes, plots or beats, parses no backup
file, and has no database. Every rule in `services/` — live queries, the spine,
`touchedAt` merges, the delete cascade — runs in the renderer, unchanged,
because that is where the app still lives.

The one listening socket the app ever opens is the loopback HTTP server during
an OAuth handshake, bound to `127.0.0.1`, alive for the seconds between
launching the browser and receiving the redirect, and closed immediately after.
It serves one path and one response. That is the carve-out, and it is the only
one.

### Window and renderer lockdown

```
contextIsolation: true      nodeIntegration: false
sandbox: true               webSecurity: true
```

- **The preload exposes a fixed, enumerated surface** on `window.myTome` —
  nothing generic, no `ipcRenderer.invoke` passthrough, no `require`. Every
  member is listed under *The preload surface* below, and adding one is a
  deliberate act.
- **The renderer loads from a registered custom scheme**, never `file://` — a
  stable, secure origin, which is also what keys the library on disk and so
  cannot be changed later. See *The library on disk*.
- **All navigation is denied.** `will-navigate` and `setWindowOpenHandler`
  reject everything; the app is a `HashRouter`, so it never needs either.
  External links go through a `shell.openExternal` wrapper that accepts
  `https:` only and refuses anything else.
- **The desktop build ships its own CSP**, stricter than the web one, because it
  has no Google script to load. It is set as a response header on the app's
  session, not only as a `<meta>` tag.
- `session.setPermissionRequestHandler` **denies every permission** except
  `persistent-storage`, which it grants — that is `navigator.storage.persist()`
  in `services/storage.ts`, and on the desktop it should simply succeed.

## Drive with a refresh token

This is the feature. Everything else in this spec is a consequence of it.

### What changes and what does not

`services/drive.ts` keeps all of its sync logic — one file per tome, one per
author profile, one for the library's writing goals; `planSync`; merge-only; no
tombstones; never overwrite a file whose `modifiedTime` moved. **None of that
is platform-specific and none of it moves.**

What moves is *authorization and transport*, into a seam:

```
services/driveTransport.ts          The interface: authorize(), request(url, init),
                                    revoke(), isConnected(), accountLabel().
services/driveTransport.web.ts      Today's GIS pop-up client, lifted verbatim.
services/driveTransport.desktop.ts  IPC to the main process. Holds no token.
```

`drive.ts` imports the interface and never learns which implementation it got.
The desktop build selects the implementation at build time (see *Building*),
not with a runtime `if` — the web bundle should not contain desktop code and
the desktop bundle should not contain Google's script loader.

This edits an `AGENTS.md` rule: `fetch` no longer appears only in `drive.ts`.
It appears in `driveTransport.web.ts`, and in the desktop main process. Update
the sentence rather than letting it go quietly false.

### The flow

Google's installed-app flow, RFC 8252, run entirely in the main process:

1. Generate a PKCE `code_verifier` and its `code_challenge` (S256), and a
   `state` nonce.
2. Bind an HTTP listener to `127.0.0.1` on an **ephemeral port** — Google
   accepts any port on the loopback address for a desktop client, so nothing
   needs registering in the console.
3. `shell.openExternal` the authorization URL in the author's **real browser**,
   where they are already signed in to Google and can see the address bar.
   Requesting `access_type=offline` and `prompt=consent`, scope `drive.file` and
   nothing else.
4. The browser redirects to `http://127.0.0.1:<port>/callback?code=…&state=…`.
   Verify `state`, close the listener, and serve one small page that says it
   worked and to close the tab.
5. Exchange the code at `https://oauth2.googleapis.com/token` with the
   `code_verifier`. The response carries an **access token** and a **refresh
   token**.

Never in an Electron `BrowserWindow`. Google rejects OAuth in embedded webviews
(`disallowed_useragent`), and it is right to — the author must be able to see
what they are signing into.

### Where the tokens live

- **The access token lives in a main-process variable and nowhere else.** The
  existing rule, kept exactly.
- **The refresh token is encrypted with Electron's `safeStorage`** and written
  to a single file in `app.getPath("userData")`. Never in `localStorage`, never
  in IndexedDB, never in a cookie, never in plaintext on disk. The backend is
  the OS's: DPAPI on Windows, the Keychain on macOS, libsecret
  (gnome-keyring/kwallet) on Linux.
- **`isEncryptionAvailable()` is not a sufficient check, and Linux is why.**
  When no keyring is present — a minimal desktop, a headless session, some
  distributions out of the box — Electron falls back to a `basic_text` backend
  that "encrypts" with a hardcoded key. It is obfuscation, not encryption, and
  `isEncryptionAvailable()` still returns `true`. **The vault must also read
  `safeStorage.getSelectedStorageBackend()` and refuse `basic_text`**, or we
  will ship a bearer credential in effective plaintext to exactly the users
  least likely to notice. This is written now because `vault.ts` gets built in
  phase 2, on Windows, where the trap never fires.
- **When the vault cannot protect the token, we do not persist it.** The app
  falls back to the web app's behaviour of re-consenting each session and says
  so plainly in the UI — a worse feature, never a quieter risk.
- **The renderer never sees either token.** This is a real security improvement
  over the web app, and worth stating plainly: today an XSS in the tab can read
  a Drive token and use it anywhere for an hour. On the desktop, the renderer
  can ask the main process to make a Drive call while the app is running, but
  there is no token for it to steal.

This amends the `drive.ts` header rule "the token never leaves memory." It still
holds for the *access* token. For the refresh token, write the new rule down in
the same header: encrypted at rest by the OS, main process only, deleted on
disconnect.

### Refresh, and the failure that matters

`request()` in the main process attaches the access token. On a `401`, refresh
once against the token endpoint and retry — silently, with no window, no prompt,
and no user gesture. That is what the whole feature buys.

When the refresh itself fails — the grant was revoked in the author's Google
account, the token expired, the password changed — **delete the stored refresh
token and surface a plain "reconnect" state.** Never loop, never retry on a
timer, never silently do nothing. A sync that cannot authorize must say so on
`/backup`.

### The console setup that makes this work — read this before building

Two things in the current `docs/google-drive-sync.md` must change for the
desktop client, and one of them would silently defeat the entire feature.

1. **A second OAuth client, of type "Desktop app."** The web client stays as it
   is — its type is *Web application* and it cannot do the loopback flow. The
   desktop client needs no registered redirect URI; loopback is implicit.

2. **The app must be published to Production, not left in Testing.** The
   existing doc says to keep the consent screen in *Testing* with yourself as a
   test user, to avoid the verification review. **Refresh tokens issued by an
   app in Testing expire after seven days.** An app that makes you reconnect
   every week is the problem we are trying to solve. Publishing to Production is
   available without a verification review for apps requesting only
   non-sensitive scopes, and `drive.file` is one — that per-file grant is
   exactly why the app asks for it. Verify this in the console before building
   anything; Google reclassifies scopes, and the console is the authority here
   the way it already is in the sync doc.

### The client secret, and the rule it appears to break

`AGENTS.md` says the repo must never gain a secret, and `.env.example` says
there is no client secret in this flow and one must never be added. Google's
desktop client type issues a client secret and expects it in the token
exchange. Both of those statements have to survive, so:

- **The desktop client id and secret are build inputs, never files in the
  repo.** They come from a git-ignored `.env.desktop.local` when packaging
  locally, and from repository secrets in CI. The repo gains nothing.
- **They are not confidential, and we do not pretend otherwise.** RFC 8252 §8.5
  is explicit that a credential shipped inside an installed application is not a
  secret, which is why PKCE — not the secret — is what actually protects the
  exchange. Anyone can extract it from the installer.
- **Scope `drive.file` is what makes that acceptable.** An extracted credential
  grants an attacker nothing on its own: they still need the author's own
  consent, and it would still reach only files this app created.
- `.env.example` gets its wording scoped to the web flow, with a pointer here.

## The library on disk

Electron's renderer is Chromium, so IndexedDB is the same implementation the
web app already uses, backed by LevelDB. The store lands under
`app.getPath("userData")` as **two** directories:

```
<userData>/IndexedDB/<origin>.indexeddb.leveldb/
<userData>/IndexedDB/<origin>.indexeddb.blob/
```

`myTomeDB` ([`models/db.ts`](../src/models/db.ts)) is a name *inside* that
store; the directories are keyed by **origin**. The second one holds large
`Blob` values — the cover images — which is the first reason nobody should ever
be told to back up by copying a folder.

### The origin is a one-way decision

Because the store is keyed by origin, **how the renderer is loaded decides
where the library lives**, and changing it later orphans every library already
on disk. `file://` would work — Electron special-cases it — but it is an opaque
origin and not a secure context.

**The app loads from a registered custom scheme.** Registered before
`app.ready` with `protocol.registerSchemesAsPrivileged`, privileges `standard:
true, secure: true, supportFetchAPI: true`, served from the packaged bundle.

**Pick the scheme once and never change it.** A v2 that switches schemes leaves
every author's work in a directory the app can no longer see — indistinguishable
from total data loss, and recoverable only by hand. The same is true of
`app.getName()` and the application id, which decide `userData` itself. Those
three strings are load-bearing in the way a shipped `.version(n)` block is:
additive changes only.

### What durability actually improves

The browser's reasons to delete an author's work do go away. No "clear browsing
data", no private window, no eviction under pressure from other origins, no
clear-after-*N*-days heuristic. The app is the only origin in its own profile,
and `navigator.storage.persist()` in `services/storage.ts` should simply
succeed once the permission handler grants `persistent-storage`.

Electron then contributes a smaller set of its own, every one of which is ours
to not do:

- **`deleteAppDataOnUninstall` stays `false`** in the NSIS config, which is its
  default. Flipping it means uninstalling deletes every novel.
- **`session.clearStorageData()` must never appear in this codebase.** No
  feature needs it, and it wipes the library.
- **Renaming the app or changing the application id** moves `userData`.
- **Changing the origin**, as above.
- **LevelDB corruption** after power loss or an OS kill mid-write. Chromium
  replays its log and recovers from most of these. Not all.

So the claim is narrower than "desktop means your work is safe": Electron
removes the browser's reasons to delete the library and adds a shorter list of
our own. **The database is still not a backup.** Auto-export is not a
convenience sitting beside durability — it is what makes the durability claim
true.

### The library is not encrypted, and that is the right call

The LevelDB files are plaintext on disk. `strings` over them shows prose.
Anything that can read `<userData>` can read every manuscript in the library.
What protects them is ordinary file permissions — the profile directory is
ACL'd to that account plus administrators — so another standard user on the
machine cannot read it, while an administrator, malware running as the author,
or anyone at an unlocked keyboard can.

**The fair comparison is a `.docx` sitting in Documents**, which is also
unencrypted. The library is exactly that private, and the privacy page should
say so in those words rather than leaving it to be inferred.

Beside a refresh token we go to real trouble to encrypt, that looks
inconsistent. It is worth writing down why it is not:

- **What theft costs differs by an order of magnitude.** A stolen refresh token
  is ongoing access to a live Google account from anywhere in the world. A
  stolen manuscript file is a stolen file — bad, but local and bounded, and
  whoever could read it could equally have keylogged the author.
- **Encrypting the database would be theatre.** With no account and no
  password, the key would have to live on the same disk as the data. That is
  the `basic_text` trap from the section above, with better branding.
- **Real encryption means a passphrase the author types**, and therefore a
  forgotten passphrase meaning a permanently lost novel. That is a product
  decision with a body count, not a default. At-rest protection is BitLocker
  and FileVault — the author's own OS setting, not ours to reimplement badly.

### Reachable from outside, with effort

The files sit in a normal user-writable folder, but the format is two layers
deep — LevelDB on the outside, V8 structured clone inside — so it is readable
by forensic tooling and by nobody who double-clicks it. Two consequences:

- **The backup file is the interchange format.** Never document the IndexedDB
  directory as something to copy: wrong format, tied to an origin and an app
  version, and trivially missing the `.blob` directory and so every cover
  image.
- **DevTools is the easy way in.** If the packaged build leaves DevTools
  reachable, anyone at the keyboard can browse and edit the entire library from
  Application → IndexedDB with no tooling at all. Decide this deliberately.
  Recommended: leave it — someone at an unlocked machine already has the files,
  and it is the only way to help an author whose database is in a strange
  state — but record that it was a choice rather than an inheritance.

### Coming from the web app

The desktop store is a different store from the browser's, so **an author
moving from web to desktop is a migration and the app must not pretend
otherwise.** The two supported routes are a backup file and Drive sync, both of
which already exist and already merge correctly. A first run with an empty
library should say this, rather than looking like the work is gone.

## Automatic backup export

Dexie stays the source of truth. The desktop app additionally writes backup
files to a folder the author chooses — so that the library is visible as files,
and so that pointing that folder at Drive, Dropbox or a git repo is a sync story
that needs no OAuth at all.

- **The file is a `BackupFile` from `backup.ts`, unchanged.** Not a second
  format, not a variant, not "a desktop format." Same rule the Drive header
  already states: transport, never format.
- **The renderer builds it; the main process writes it.** `createBackup` runs
  where it already runs, and hands the main process bytes and a filename from
  `backupFileName`.
- Whole-library file, so the writing goals row rides along — the one-tome file
  deliberately excludes it.
- **Scheduling is a pure module** under `src/services/` with no Electron import
  and no React: given the last export time, the current time and the author's
  settings, what should happen. Tested under `node` alongside `activityStats.ts`
  and `autosave.ts`, which is the pattern this repo already uses for exactly
  this reason.
- **Retention is a policy, not a pile.** Keep the last *N* (default 10) and
  delete older ones — the only place this app deletes a file, and it only ever
  deletes files it wrote, matched by the `backupFileName` shape.
- Export never blocks the UI and never interrupts writing. A failure — folder
  gone, disk full, permission denied — shows on `/backup` and does not retry in
  a loop.
- **It is off until the author picks a folder.** No silent writing to disk.

## Native OS integration

Each of these replaces a browser affordance with the OS one; none changes what
is produced.

| Today | Desktop |
|---|---|
| `<a download>` for backup JSON (`BackupPage`) | Native save dialog, author picks the location |
| `<a download>` for `.docx` (`ManuscriptExportDialog`) | Native save dialog; offer "open after saving" |
| `window.print()` for PDF | Unchanged — Electron's print dialog is the OS one |
| `<input type="file">` for cover images (`ImagePicker`) | Native picker; the file still becomes a `Blob` in Dexie |
| `<input type="file">` for restore | Native picker, filtered to `.json` |

`useObjectUrl.ts` stays the only place render-land calls `createObjectURL` — the
desktop paths hand bytes across IPC and never allocate one.

Where the library itself lives, and what that does and does not guarantee, is
*The library on disk* above.

### The preload surface

The complete list. Anything not here does not exist to the renderer.

```
dialog.saveFile(suggestedName, filters, bytes)   → path | null
dialog.openFile(filters)                         → { name, bytes } | null
dialog.chooseFolder()                            → path | null
drive.authorize()                                → { email } — opens the browser
drive.request(url, init)                         → { status, headers, body }
drive.revoke()                                   → void
drive.state()                                    → "connected" | "disconnected" | "needs-reconnect"
backup.write(folder, filename, bytes)            → void
backup.prune(folder, keep)                       → number deleted
shell.openExternal(url)                          → void — https: only
app.version()                                    → string
```

`drive.request` takes a URL the renderer chose, which is the one place this
surface is broad. **The main process validates it against an allowlist of
`https://www.googleapis.com/drive/v3` and
`https://www.googleapis.com/upload/drive/v3` prefixes and refuses anything
else** — otherwise the preload is an open proxy with the author's Google token
attached.

## Building and shipping

### Repo layout

```
desktop/
  main.ts        Window, lockdown, IPC registration. Thin.
  preload.ts     The surface above, and nothing more.
  oauth.ts       PKCE, loopback listener, token exchange, refresh. Pure where
                 it can be — the PKCE and callback parsing are testable.
  vault.ts       safeStorage read/write/delete for the refresh token.
  files.ts       Dialogs, backup writing, retention pruning.
  builder.yml    electron-builder config.
```

`src/` gains only `driveTransport*.ts`. Nothing else in the app knows a desktop
build exists — with one exception: the UI on `/backup` needs to show a connected
account and a reconnect state, which the web build simply never enters.

### Scripts and gates

```bash
npm run dev            # unchanged, browser
npm run desktop:dev    # Vite dev server + Electron pointed at it
npm run desktop:build  # vite build --mode desktop, then electron-builder
npm run build          # unchanged — still the web gate, and still web-only
npm test               # unchanged command; include widens to desktop/**/*.test.ts
```

**`desktop/` gets its own tsconfig, and that is not a style preference.** The
root `tsconfig.json` sets `lib: ["ES2023", "DOM", "DOM.Iterable"]` and
`types: ["vite/client"]` — it describes a browser program. Main-process code
type-checked against it would accept `document` and `window` happily and then
fail at runtime, while Electron's own types would pull Node globals into scope
for every file under `src/`, where they have no business being.

```
tsconfig.json          include: ["src"]      — unchanged, browser libs
tsconfig.desktop.json  include: ["desktop"]  — node lib, electron types
```

`npm run build` type-checks `src` only, exactly as it does today, so **a broken
file under `desktop/` can never block a web deploy.** `npm run desktop:build`
runs both. Desktop tests live in `desktop/__tests__/` and are type-checked by
the desktop config, mirroring how the root config already covers the tests
under `src/`.

**The two gates stay two gates.** The desktop Vite mode sets `base: "./"` (not
`/myTome/`) and the desktop CSP. `HashRouter` needs no change and is, if
anything, more obviously right here.

### Keeping the web build clean

The desktop work touches `src/` in exactly one place — the transport seam — and
three rules are what keep it there:

- **The transport is selected at build time**, by a Vite `resolve.alias` keyed
  on mode, never by a runtime `if`. A runtime check would ship desktop code to
  the browser and Google's script loader to the desktop; an alias makes each
  bundle structurally incapable of containing the other.
- **No component asks whether it is running in Electron.** `/backup` needs a
  connected-account and a reconnect state the web build never enters, and it
  takes them from the transport's own `state()` and `accountLabel()` — not from
  an `isDesktop()` helper. The moment such a helper exists it spreads, and the
  two builds stop being one app.
- **Desktop OAuth credentials never touch `import.meta.env`.** Vite inlines
  those into the *renderer* bundle, which is both the wrong process and a route
  by which they could reach a web build. They are read by the main process and
  live in `desktop/`. That is what keeps the `AGENTS.md` rule that
  `import.meta.env` carries one variable — a public client id — true.

`deploy.yml` needs one line and no more: `ELECTRON_SKIP_BINARY_DOWNLOAD=1` on
the `npm ci` step, so a web deploy stops downloading a ~100 MB Electron binary
it will never run.

### What can be tested

Real coverage is possible for more of this than it looks, and the repo's own
rule says how: extract what is only data into a React-free, Electron-free
module. That covers PKCE challenge generation, the callback URL parser
(including a mismatched `state`), the refresh-and-retry decision, the export
scheduler, and the retention policy.

**What cannot be tested, and must be verified by running the app:** the OAuth
round trip, `safeStorage`, every native dialog, printing, and auto-update. That
list belongs in the commit message, per house rule.

### Signing and distribution

v1 ships Windows. **The release workflow is written as a three-platform matrix
with two entries disabled**, not as a Windows script to be generalised later:
macOS builds cannot be produced on a Linux runner, because notarization needs
Apple's own tooling, so the shape of the workflow is decided by a platform that
is not shipping yet. Enabling a row should be a one-line change.

| | Target | Signing | Auto-update |
|---|---|---|---|
| Windows | NSIS, per-user (no administrator) | Azure Trusted Signing, or an OV certificate | yes |
| macOS | dmg, universal (arm64 + x64) | Apple Developer, $99/yr, **plus notarization** | yes — only when signed and notarized |
| Linux | **AppImage** | none available | yes — AppImage only |

- **Signing is not optional on Windows and cannot be skipped on macOS.**
  Unsigned on Windows, SmartScreen warns every author who downloads it, which
  for an app whose pitch is "your work is safe here" is the wrong first
  impression. Unsigned or un-notarized on macOS, Gatekeeper *blocks* the app —
  a refusal rather than a warning — and it also breaks `electron-updater`,
  which verifies the signature before applying anything.
- **AppImage is the Linux target because of auto-update.** `electron-updater`
  supports AppImage and supports neither deb nor rpm; a `.deb` author would sit
  on one version forever unless told by hand to re-download. Publish deb/rpm
  later if asked, and say in the UI that they do not update themselves.
- **Auto-update via `electron-updater`**, feed hosted on GitHub Releases. Update
  on launch, never mid-session — an author writing a chapter does not want a
  restart prompt.
- **The release workflow is `workflow_dispatch` only**, matching `deploy.yml`.
  Pushing to `main` must not ship an installer any more than it ships the site.

### Maintenance

Electron carries Chromium, and a stale Electron ships known CVEs to an app that
holds a refresh token. **Pin the Electron major, and treat its upgrades as
scheduled work, not as something to do when convenient.**

## Documents this feature makes wrong

`AGENTS.md` says `/privacy` and `/terms` go stale silently. This feature is
precisely the kind that does it, so the list is part of the spec:

- **`/privacy` — network list.** It mirrors the CSP. The desktop build adds
  `https://oauth2.googleapis.com` (token exchange) and the loopback listener,
  which is not a remote host but is a socket and should be described.
- **`/privacy` — storage list.** It names every key. Add the encrypted refresh
  token file, the chosen export folder, and the last auto-export time. Name
  where the library lives on each platform (`%APPDATA%\myTome`,
  `~/Library/Application Support/myTome`, `~/.config/myTome`) and say it is not
  the same library as the browser's.
- **`/privacy` — a sentence that does not exist yet.** That the library is
  **not encrypted**, and is as private as any document file in the author's
  account — protected by the operating system's file permissions and by
  BitLocker or FileVault if they use them, and by nothing myTome adds. The
  refresh token is the exception and should be named as one. A privacy page
  that leaves this to inference is exactly the silent staleness `AGENTS.md`
  warns about.
- Both pages' **"Last updated"** lines move. They render through
  `PolicyProse.tsx`.
- **`AGENTS.md`**: the no-backend paragraph (add the main process carve-out),
  the "`fetch` appears in that module only" sentence, and "`import.meta.env`
  carries that one variable only."
- **`drive.ts` header**: the token rule, now two rules.
- **`.env.example`**: scope the no-secret sentence to the web flow.
- **`docs/google-drive-sync.md`**: the Testing-vs-Production warning above is
  the most important edit in this list, and it applies to the *web* client too
  for anyone who cares about the seven-day expiry.
- `/terms` clause 8 says the repo carries no licence. Shipping a signed
  installer to other people is the moment to decide whether that is still what
  you want; if a `LICENSE` appears, clause 8 changes in the same commit.

## Phases

1. **Shell.** Electron loads the existing bundle, locked down, with the preload
   surface stubbed. **The custom scheme is chosen here and is effectively
   permanent** — it keys the library on disk, so a later change orphans real
   work. Also here, because they are cheap now and expensive later: the
   application menu carrying the Edit roles, and the bundled serif. Verify
   the whole app works — Lexical, drag-and-drop, print, IndexedDB, images — and
   **keep that list as a written checklist**, because it is the one that gets
   re-run on macOS and Linux when their turn comes. Nothing new in this phase;
   it exists to prove the port is boring.
2. **Drive.** The transport seam, the loopback flow, the vault, refresh and
   retry. The reason for the project; do it while the rest is still simple.
3. **Native files.** Dialogs for backup, docx and images.
4. **Auto-export.** Folder picker, scheduler, retention.
5. **Ship.** Signing, installer, auto-update, the documentation list above.

Phases 1 and 2 are the release that justifies itself. Everything after is
comfort.

## Open questions

- **Silent background sync.** A refresh token makes "sync on launch, sync every
  N minutes, sync on quit" possible for the first time. It is also the feature
  most able to surprise someone — a merge they did not ask for, while they
  write. Proposed default: sync on launch and on quit, visible in the UI, and
  nothing on a timer until that has been lived with.
- **One window or several?** A second window on a second monitor is a real
  writing want, and Dexie live queries would keep them in step. It is also a new
  class of bug (two editors, one `WriteItem`, autosave on both). Out of v1.
- **Linux packaging beyond AppImage.** Flatpak is how a lot of Linux users
  expect to install a desktop app, and it sandboxes the filesystem — so the
  auto-export folder picker would have to go through a portal rather than a
  plain path. Worth deciding before Linux ships, not during.
- **Who tests macOS and Linux?** Nothing in `npm test` can see a platform bug,
  and CI can build an artifact it cannot run. Before either platform ships,
  there has to be an actual machine — or an actual person — running the phase 1
  checklist on it.
