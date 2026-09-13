# myTome

A local-first novel-writing workspace. An author creates **Tomes** (books),
defines their own **ElementTypes** (Character, Place, Faction, …) with custom
fields, fills them with **Elements**, links elements with **Relationships**,
lays out **Plots** as ordered **PlotItem** beats aligned on a shared axis of
**PlotRows**, and writes prose as **WriteItems** in a Lexical editor.

**There is no backend.** No server of ours, no API, no accounts — everything
lives in IndexedDB via Dexie, shipped as a static bundle on GitHub Pages. Don't
reach for a data-fetching library or invent a service; if a feature seems to
need a server, say so rather than building one.

**The one exception is `services/drive.ts`** — optional Google Drive sync,
calling `accounts.google.com` and `www.googleapis.com` per user click, and
absent entirely from a build without `VITE_GOOGLE_CLIENT_ID`. It is not
permission to fetch things generally; a second remote dependency needs the same
justification. `fetch` appears in that module only, and `import.meta.env`
carries that one variable only — a *public* OAuth client id. The repo must never
gain a secret.

`CLAUDE.md` is just `@AGENTS.md`. `src/components/AGENTS.md` is the UI
companion; it loads on its own in `src/components` (through that folder's own
`CLAUDE.md`), and must be read before touching `src/pages` or `src/lexical` too.

**The reasoning lives in the code.** Module header comments (`drive.ts`,
`backup.ts`, `syncPlan.ts`, `manuscript.ts`, `spine.ts`, `storyOrder.ts`, …),
the per-version comments in `models/db.ts` and the per-route comments in
`App.tsx` explain *why*. This file holds the rules that span files, or that you
would break without opening the file that explains them. Read a module's header
before changing it.

## Commands

```bash
npm run dev      # Vite dev server on :5173 — use the myTome launch config, not a hand-started Vite
npm run build    # tsc --noEmit, then vite build
npm run preview  # serve the built dist/
npm test         # vitest run
npm run test:watch
```

**Two gates: `npm run build` and `npm test`.** There is no ESLint or Prettier;
the stray `eslint-disable` comments are leftovers nothing enforces. Don't add a
linter or formatter unless asked. Match surrounding formatting (2-space indent,
double quotes, trailing commas, semicolons).

- `tsc` runs first, and `noUnusedLocals`, `noUnusedParameters` and
  `noFallthroughCasesInSwitch` are errors. `tsconfig.json` includes all of
  `src`, so tests are type-checked by the build too.
- TypeScript is in bundler mode with `verbatimModuleSyntax` and
  `erasableSyntaxOnly`: type-only imports **must** use `import type { … }`, and
  `enum`, parameter properties and namespaces are compile errors. Use
  string-literal unions and `const` objects (`WriteItemType`, `TomeStatus`,
  `FieldKind`).
- `docx` ships `@types/node`, so `setTimeout` returns a `Timeout`. Type timer
  handles as `ReturnType<typeof setTimeout>`.

### What the suite can and cannot reach

`test.environment` is `node` and `include` is `src/**/*.test.ts` — no jsdom, no
component or page tests, and a `.test.tsx` is not even collected. Don't add a
DOM environment or React Testing Library unless asked.

**When logic worth testing is trapped in a component, extract the part that is
only data and timers into a React-free module**, and leave the React binding too
thin to need a test. Existing instances:

- `hooks/autosave.ts` — the Write editor's autosave timing, driven under
  `vi.useFakeTimers()`; `useAutosave.ts` binds it to React.
- `lexical/blocks.ts` — a stored Lexical document as a plain descriptor tree,
  plus the run tag and class rules (`outerTagFor`, `innerTagFor`,
  `runClassName`, `proseTextTheme`), kept here so the static and mounted renders
  cannot drift. `components/StaticProse.tsx` is its thin renderer. `lexical`
  imports cleanly under `node`: decode formats against its own
  `IS_BOLD`/`IS_ITALIC`/… exports, never hardcoded bits.
- `services/syncPlan.ts`, `manuscript.ts`, `storyOrder.ts`, `slug.ts` — pure,
  read no table.

**A green suite is not a run.** Layout, timing, focus, stacking and hit-testing
bugs are invisible under `node`, and jsdom would not help. For UI behavior, run
the app and drive it; the known traps are written up in
`src/components/AGENTS.md`.

## Deployment

`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages and is
**`workflow_dispatch` only** — pushing to `main` ships nothing, on purpose.

The site is served from a subpath (`base: "/myTome/"` in `vite.config.ts`) and
Pages has no rewrite rule, which is why the router is `HashRouter`
(`#/tomes/:tomeId/...`). Don't switch router types without solving that.

**The built page ships a CSP** as a `<meta>` from `vite.config.ts`, build-only
(dev needs `eval` and a websocket). A new remote host must be added there or it
is silently blocked in production only — verify a production build in the
browser, not just `dev`. Then update the privacy page (see Routes).

## Layout

```
src/
  models/      Data shapes + the two template registries. Only db.ts declares the Dexie schema.
  services/    The data layer, split by table behind the store.ts barrel. Tests in __tests__/.
  hooks/       useObservable.ts (Dexie liveQuery → React state), autosave.ts (framework-free,
               tested) + useAutosave.ts, and useObjectUrl.ts — the only place render-land
               calls createObjectURL. Tests in __tests__/.
  context/     App-wide state: tomes, current workspace, confirm dialog, color mode, prose face.
  layouts/     WorkspaceLayout.tsx — the /tomes/:tomeId/* shell (nav + header + Outlet).
  pages/       Route-level screens, one per <Route> in App.tsx.
  components/  Reusable UI. Has its own AGENTS.md — read it.
  lexical/     Custom Lexical nodes and plugins, plus blocks.ts (tested in __tests__/).
  theme.ts     getTheme(mode) — the warm-paper brand palette, light and dark.
```

**The one layering rule: `src/models/db.ts` is imported only by files in
`src/services/`.** Pages, components and contexts call `store`, never `db`. That
boundary is what keeps schema migrations tractable.

## `services/` — the data layer

`store.ts` is a **barrel**: it spreads one object per domain module into the
single `store` the app imports (`import { store } from "…/services/store"`).
The split is invisible outside this directory — keep it that way, and add a new
domain module's object to the spread.

```
services/
  store.ts           The barrel.
  internal.ts        uid/now/slugify, observe, sameSet, byRank, range queries, detach*, applyOrder.
  slug.ts            The one slug rule. Imports nothing, so pure modules can use it without db.
  validate.ts        The four validators, plus the completeness helpers.
  images.ts          imageHref / imageFrom. Neither allocates an object URL.
  tomes.ts           Tomes + the eight-table delete cascade. Sole writer of the tome text mirror.
  authors.ts         Author profiles — the one table no tome owns. Sole writer of its mirror.
  templates.ts       applyTomeTemplate, createPlotFromTemplate. Create-time only.
  elementTypes.ts    Types, field definitions, the count* helpers.
  elements.ts        Elements + relationships. Sole writer of the element text mirrors.
  spine.ts           The shared row axis. Sole writer of row ranks and PlotItem.plotRowId.
  plots.ts           Plots and beats. Imports ordering from spine.ts; spine.ts imports nothing back.
  writeItems.ts      Prose rows + both sides of the beat↔text link. Sole writer of wordCount.
  backup.ts          The backup file format, export, restore/merge.
  syncPlan.ts        Pure: what a sync should move.
  drive.ts           The only network code. Optional, gated, untested — verify in the built app.
  storage.ts         navigator.storage.persist(). Touches no table; not on `store`.
  manuscript.ts      Pure: what a plot line's manuscript contains. Not on `store`.
  manuscriptDocx.ts  That manuscript as OOXML. Lazy-loaded; not on `store`.
  storyOrder.ts      Pure: what the Write list shows and how it orders it. Not on `store`.
  __tests__/         vitest + fake-indexeddb.
```

Conventions:

- **Reads are live queries.** Every `store.observe*(…, callback)` is an
  `observe` call from `internal.ts`, which also decides that a live-query error
  goes to the console and nowhere else. Pass them to `useObservable`; never
  subscribe by hand in a `useEffect`. Because every read is live, a mutation
  needs no manual refresh — don't keep local "optimistic" copies of saved data.
- **Mutations** are plain async `store.save*` / `delete*` / `apply*`.
- **Validation is outside the mutations.** The form calls `validateElement`,
  `validateFields`, `validatePlotItem` or `validateRelationship` before saving,
  so the thrown message renders as the dialog's inline error. Follow that split
  for new entities.
- **`required` is completeness, not validity.** Fields are edited one at a time,
  so `validateElement` rejects only what cannot be stored (a nameless element, a
  select value outside its list); `missingRequiredFields` reports the rest, shown
  as a chip.
- Ids are `crypto.randomUUID()`. Timestamps are **ISO strings**, never `Date`
  objects — they are stored, indexed and sorted as strings.
- Manual ordering is an integer `sortOrder` compacted by `applyOrder` inside the
  transaction — except `plotItems` (see the spine). Every reorder runs `sameSet`
  first and drops a drag whose set another tab has since changed.
- Cascades run in `db.transaction("rw", …)` listing every table touched.
  Deleting a tome clears the eight tome-owned tables and never `authors`.
  Deleting an Element strips its id from relationships and every beat's
  `attachedElementIds` (`detachElements`); deleting a WriteItem does the same
  (`detachWriteItem`). Deleting an author un-credits every tome naming it and
  touches their `updatedAt` so a sync carries the change.
- A `Tome.authorId` naming a missing profile reads as uncredited everywhere.
- Read `plotItems` through `readPlotItem`, which defaults the two id arrays. It
  does **not** default `plotRowId`; a beat without one sorts to the end of its
  plot (`byRank`).

### The spine: row order is the truth

A tome has **one ordered list of `PlotRow`s**, and every beat stands on one
(`PlotItem.plotRowId`, required). Two beats on the same row are contemporaneous;
a gap is the absence of a cell. **`PlotItem.sortOrder` is a cache of row rank**,
kept only so the `[plotId+sortOrder]` index and single-plot readers keep working.

- **Never write `plotItems.sortOrder` from an index.** End every mutation that
  touches rows or row assignments with `syncPlotSortOrder(tomeId)` inside its
  transaction; a no-op call costs one read and fires no live query.
  `savePlotItem` calls it too.
- `reorderPlotItems` permutes which beat stands on each row the plot already
  occupies — it never renumbers, so no other plot loses alignment.
- Inserting a row shifts the spine; every beat keeps its row id, so all plots
  move together.
- A plot holds at most one beat per row; `movePlotItemToRow` swaps when the
  target cell is taken.
- Deleting a beat leaves its row standing (that is the gap).
  `removeEmptyPlotRows` drops rows that *no plot in the tome* occupies.
- **`deletePlotRow` deletes every plot's beat on that row** — the one plot
  mutation destructive beyond the plot on screen. `countPlotRowBeats` gives the
  confirm dialog the cost.

### Testing this layer

- `fake-indexeddb/auto` is installed in `setup.ts`. `db` is a module singleton,
  so isolation is `db.delete()` then `db.open()` in `beforeEach` — replaying
  every schema version — not re-importing the module.
- **Assert `expectSpineIntact(tomeId)` (`helpers.ts`) after every mutation that
  could touch rows or row assignments.** Write alignment expectations through
  `columnOf(tomeId, plotId)`, which renders a plot as `["a1", null, "a2"]`.
- **Test a migration by building an older database**: open a plain Dexie under
  its own name with the old schema, seed it, close it, then open `MyTomeDB` over
  it (its `name` parameter exists for this). Test a re-run backfill by calling
  the exported function directly inside a transaction.
- Don't test the `observe*` wrappers — that tests Dexie. Test the mutation and
  read the table.
- **Never assert an order that `updatedAt` alone decides**: two writes in one
  millisecond share a timestamp, and the test flakes. Set `updatedAt`
  explicitly, as `elements.test.ts > suggestRelationshipLabels` does.

### Backup and sync

The backup file is the only copy of a library that survives a cleared browser,
and Drive sync is a second *transport* for the same file — never a second
format. Reasoning is in the `backup.ts`, `syncPlan.ts` and `drive.ts` headers.

- One-tome and whole-library files are the same shape. Ids are preserved
  exactly, so restoring a file twice is a no-op.
- **A merge compares `touchedAt`** (the newest `updatedAt` anywhere in a tome),
  never `Tome.updatedAt`, **and replaces a tome whole**, never row by row.
  Anything new that compares two copies of a tome must use `touchedAt`.
- Author profiles are the exception: they merge row by row, newest `updatedAt`
  wins, sync as their own Drive file, and are not part of `touchedAt`.
- `Blob`s travel as base64 through `serializeImage`/`deserializeImage`.
- **A restore bypasses Dexie's upgrades, so it must produce what the current
  schema would**: the spine satisfying `expectSpineIntact` (backfilled rows,
  then `syncPlotSortOrder`), and `writeTome` converting plain-text descriptions
  and deriving every text mirror and `wordCount`. A new derived field gets added
  there too.
- **Bump `backupFormatVersion` (now 3) only when an older reader would
  *misread* a field it already knows** — as happened when element and tome
  descriptions became documents under unchanged names. Added fields don't
  count; an older reader ignores them.
- **A sync only ever merges.** `"replace"` stays a deliberate act on a file a
  human picked, behind a confirm.
- **The OAuth token lives in a module variable only** — never `localStorage`,
  IndexedDB or a cookie. No refresh token; the short lifetime is the design.
- **`drive.file` is the only scope.** Never widen it to `drive` or
  `drive.readonly`.
- Nothing is ever deleted from Drive, and no upload overwrites a file whose
  `modifiedTime` moved since the plan. **Sync has no tombstones**, so a deleted
  tome comes back on the next sync and the UI says so; real deletion means a
  format-version bump.
- Google's script is injected on first connect, never at page load.
- `storage.ts` asks for persistent storage only once the library holds a tome,
  at most once per page load, and swallows a refusal.

### Manuscript export

- **A manuscript is one plot line, by design.** Two beats on one spine row have
  no reading order. If a whole tome needs exporting, the book is a plot — don't
  build a multi-plot exporter, and don't mistake `storyOrder.ts`'s plot-major
  sort for one. See the `manuscript.ts` header.
- `manuscript.ts` decides; `manuscriptDocx.ts` and `ManuscriptPrint.tsx` only
  render. **Nothing is dropped silently**: skipped beats, texts and dangling ids
  go in `skipped`, texts composed into several beats in `repeated`, and the
  dialog shows both before the download.
- A byline is always `authorByline` (`models/Author.ts`): the pen name, else the
  name.
- **There is no PDF library, and there should not be one.** PDF is the browser's
  print dialog over `ManuscriptPrint`. `docx` is `import()`ed at the click and
  must stay out of the main bundle.
- **Printed paper is white in both colour modes**: any colour added to
  `manuscriptSx` needs an ink override in `inkSx`.
- Wait for images on `load`, never `decode()` — it never settles in a hidden
  tab.

### Two vestigial things — don't build on them

- `Element.deletedAt` is filtered on but never written; `deleteElement`
  hard-deletes. There is no trash or restore.
- The `activities` table has no reader and no writer.

## Dexie schema changes — read before editing `models/db.ts`

The database is `myTomeDB`, currently at **version 11**. Each version's
reasoning is commented beside it in `db.ts`.

1. **Never edit a shipped `.version(n)` block.** Add `.version(n+1)`.
2. **A new table needs no upgrade. A new field on an existing table needs one**
   when readers or an index require a value (v5's `writeItemIds` must be an
   array); an optional field for which `undefined` is the right reading needs
   none (v11's `Tome.authorId`).
3. **Backfills are idempotent and resumable**, and exported from `db.ts` so the
   tests and `restoreBackup` can re-run them.
4. **Fix a missing or wrong upgrade with a new no-op version that carries the
   corrected one** (v6). Dexie never re-runs an upgrade for an applied version.
5. A backfill converting text to a Lexical document must skip anything
   `isProseDocument` already recognises, or a re-run buries the author's words
   inside JSON.
6. Don't index what is sorted or filtered in memory per tome; Dexie would
   maintain it on every autosave keystroke.

### Prose values

`FieldKind` includes `prose`, and element, tome and author descriptions are
Lexical documents too — each stored as a `JSON.stringify`ed string.

- **An empty prose value is `""`, not an empty document**, and Lexical throws on
  `JSON.parse("")`. Every stored value reaching an editor goes through
  `asProseDocument`, which also accepts plain text left by a field whose kind
  changed from `text`.
- Emptiness is a question about the text: use `isEmptyFieldValue`.
- Anything printing an attribute as text flattens it with `fieldValueText`.
- Derive `searchText` only through `elementSearchText`, and a tome's
  description only through `tomeDescription` (`models/Tome.ts`), so saves,
  upgrades and restores cannot drift.

## Naming — these are load-bearing

- A book is a **Tome**, not a Story or a Project (`:tomeId`, `tomes`).
- **`Plot`/`PlotItem`, never `Timeline`/`TimelineItem`** for records.
  `@mui/lab` is no longer a dependency, but it exports components under exactly
  those names, so records named that way would force an import alias everywhere
  the moment it came back.
- **"Spine" means the tome's shared row axis — nothing else.** The line
  `PlotGrid` draws down each column is the **track**; `PlotItem.name` ("Beat
  label") is the **beat label**.
- **`WriteItem`** is the prose record; its `type` is a closed union
  (`snippet | lore | passage | chapter`), not a user-extensible registry.
- `Element` is the app's own type and shadows the DOM's. That is intentional;
  import it explicitly rather than renaming.
- **An `Author` is a byline, not a person** ("author profile" in the UI). One
  writer with two pen names is two rows; one pen name shared by two writers is
  one row. Don't "fix" it into a person with a list of pen names.

## Routes are the dialog state

Dialogs and edit forms are **URL-addressable**, not `useState` booleans: one
page component mounted by several routes with a boolean prop (`/tomes`,
`/tomes/new` → `creating`, `/tomes/guide` → `guide`). New create/edit UI gets a
route so back, refresh and deep links work. Each route's reasoning is commented
in `App.tsx`.

- **The test for a non-route dialog is "can the URL rebuild it?"**, not "is it
  transient?". The restore dialog on `/backup` is plain `useState` because its
  state is a file the author picked.
- **A page you read is edited where it sits, with no `edit` route**: the tome
  (`dashboard`), an element (`elements/:typeId/:elementId`), an author profile
  (`/authors/:authorId`). Which field is being edited stays out of the URL.
  `TomeFormDialog` only creates; deleting a tome lives only on the dashboard.
- **Rows created by a click have no `new` route**, because a create-on-mount
  effect fires twice under `StrictMode`. `write/:writeItemId`,
  `elements/:typeId/:elementId` and author profiles open on a real id created at
  the click site, and are swept on unmount if untouched
  (`discardWriteItemIfBlank`, `discardElementIfBlank`, `discardAuthorIfBlank`).
- Composing *existing* text into a beat is a route (`…/items/:itemId/write/add`,
  optional `/:index`) because it creates nothing. It is a **sibling** of
  `…/write`, so `BeatManuscriptPage` stays mounted underneath — if it ever
  remounts, an untouched draft is swept while the author is looking at it.
- **`plots/:plotIds` is a comma-joined list, and it is the only plotting page.**
  `PlotPage` canonicalises the list (drops unknown and repeated ids, falls back
  to the tome's first plot). The first id is the **primary**: what rename,
  delete, "Add item" and `export` act on. Don't give anything a second way to
  name the plot.
- **A beat's manuscript has one address**, `plots/:plotId/items/:itemId/write`,
  never scoped to the columns on screen.
- **Old links keep resolving**: `plots/compare/:plotIds[/*]`
  (`PlotCompareRedirect`) and `plots/:plotIds/rows/:rowId` land on the current
  shapes. Don't remove them without deciding those links may 404.
- `/backup`, `/authors`, `/privacy` and `/terms` are library-level. Both writing
  routes stay under `WorkspaceLayout`, so the workspace shows behind the
  `FocusSurface` and `TomeWorkspaceContext` stays in scope.

**`/privacy` and `/terms` are claims about this repo**, and go stale silently:

- **The privacy page's network list is the CSP in `vite.config.ts`, and its
  storage list names every `localStorage` key** (colour mode, prose face, prose
  line width, guide dismissal, Drive's last-sync mark). A new host, scope or key
  makes it wrong until it is edited.
- **Terms clause 8 says the repo carries no licence.** Adding a `LICENSE` edits
  that clause in the same commit.
- Changing either page's text moves its "Last updated" line. Both render through
  `components/PolicyProse.tsx`.

`StrictMode` is on in `main.tsx`. Assume every effect mounts, cleans up and
mounts again in dev.

## UI rules (summary — details in `src/components/AGENTS.md`)

- React 19 function components with hooks. No class components, no web
  components, no `CustomEvent`/`dispatchEvent` (the app was Lit until
  `89c4d13`). Pass callbacks as props, or use Context.
- **MUI for everything.** Zero `.css` files — style with `sx` / `styled()` and
  theme tokens. Never hardcode a hex colour (the permanently-dark `SideNav` is
  the one exception), and never hand-write an inline `<svg>` icon; use
  `@mui/icons-material`.
- Anything destructive goes through `useConfirm()`'s `confirmAction`.
- State: Context for what is shared (`TomesContext`, `TomeWorkspaceContext`,
  `ConfirmContext`, `ColorModeContext`), plain `useState` for page-local UI. No
  Redux, no Zustand.

## Keeping this file small

Put a module's reasoning in its header comment, where the next reader of that
module will see it. Add to an AGENTS.md — root for data, build and routing;
`src/components/` for UI — only a rule that spans files, or one someone would
break without opening the file that explains it. Record how something was
verified in the commit message, not here.
