# myTome

A local-first novel-writing workspace. An author creates **Tomes** (books),
defines their own **ElementTypes** (Character, Place, Faction, …) with custom
fields, fills them with **Elements**, links elements with **Relationships**,
lays out **Plots** as ordered **PlotItem** beats on a timeline, aligns those
plots against each other on a shared axis of **PlotRows**, and writes prose as
**WriteItems** in a Lexical editor.

**There is no backend.** No server, no API, no auth, no network calls at
runtime — everything lives in the browser's IndexedDB via Dexie. The app is a
static bundle served from GitHub Pages. Don't reach for `fetch`, environment
secrets, or a data-fetching library; if a feature seems to need a server, say
so rather than inventing one.

`CLAUDE.md` at the repo root is just `@AGENTS.md` — this file is the canonical
source regardless of which entry point an agent loads. `src/components/AGENTS.md`
is a second, deeper file scoped to the UI layer; read it before touching
anything under `src/components`, `src/pages`, or `src/lexical`.

## Commands

```bash
npm run dev      # Vite dev server on :5173 (see .claude/launch.json)
npm run build    # tsc --noEmit, then vite build
npm run preview  # serve the built dist/
```

```bash
npm test         # vitest run — the data layer only (see below)
npm run test:watch
```

**Two gates: `npm run build` and `npm test`.** There is no ESLint config and no
Prettier config — the `eslint-disable` comment in `hooks/useObservable.ts` is a
leftover and nothing enforces it. So:

- After a change, run `npm run build`. `tsc` runs first and the flags are
  strict about the things agents get wrong: `noUnusedLocals`,
  `noUnusedParameters`, and `noFallthroughCasesInSwitch` are all errors, so a
  leftover import or an abandoned variable **fails the build**, not just lints.
  Note `tsconfig.json` includes all of `src`, so the tests are type-checked by
  `npm run build` too.
- **The suite covers `src/services` and `models/db.ts` only.** There is no
  component, hook, or page test and no jsdom — `test.environment` is `node`.
  Adding UI tests would mean adding a DOM environment and React Testing
  Library; don't, unless asked.
- To check UI behavior, still run the app and drive it. Use the `myTome` launch
  config rather than starting Vite by hand.
- Don't add a linter or formatter unless asked. Match the surrounding
  formatting by eye (2-space indent, double quotes, trailing commas,
  semicolons).

TypeScript is in bundler mode with `verbatimModuleSyntax` and
`erasableSyntaxOnly`. Consequences: type-only imports **must** be written
`import type { … }`, and `enum`, parameter properties, and namespaces are
compile errors. Use string-literal unions and `const` objects instead — the
codebase already does everywhere (`WriteItemType`, `TomeStatus`, `FieldKind`).

## Deployment

`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages, and it is
**`workflow_dispatch` only** — deploys are manual, on purpose (`a4a7493`
removed the push trigger). Pushing to `main` does not ship anything.

The site is served from a subpath, so `vite.config.ts` sets `base: "/myTome/"`.
That subpath is also why the router is `HashRouter` and not `BrowserRouter`:
Pages has no rewrite rule, so a real deep link would 404. Every URL in this app
looks like `#/tomes/:tomeId/...`. Don't switch router types without solving
that.

## Layout

```
src/
  models/      Data shapes + the two template registries. Only db.ts declares the Dexie schema.
  services/    The data layer, split by table behind the store.ts barrel. Tests in __tests__/.
  hooks/       useObservable.ts — Dexie liveQuery → React state.
  context/     App-wide state: tomes, current workspace, confirm dialog, color mode.
  layouts/     WorkspaceLayout.tsx — the /tomes/:tomeId/* shell (nav + header + Outlet).
  pages/       Route-level screens, one per <Route> in App.tsx.
  components/  Reusable UI. Has its own AGENTS.md — read it.
  lexical/     Custom Lexical nodes and plugins (mentions, toolbar).
  theme.ts     getTheme(mode) — the warm-paper brand palette, light and dark.
```

### The one layering rule

**`src/models/db.ts` is imported only by files in `src/services/`.** Pages,
components, and contexts never touch `db` directly — they call `store`. Keep it
that way; it is what makes the schema-migration rules below tractable. (This
read "by exactly one file" until `store.ts` was split; the boundary moved from a
file to a directory, and nothing outside it moved.)

## `services/` — the data layer

`store.ts` is a **barrel**, not the implementation: it spreads one object per
domain module into the single `store` the app imports. Every consumer still
writes `import { store } from "…/services/store"` and calls `store.savePlotItem`
— the split is invisible outside this directory, and it should stay that way.

```
services/
  store.ts         The barrel. Add a new domain module's object to the spread here.
  internal.ts      uid/now/slugify, the three range queries, detach*, applyOrder.
  validate.ts      The four validators. Callers invoke these, not the mutations.
  images.ts        imageUrl / imageFrom — the only members not on `store`.
  tomes.ts         Tomes + the eight-table delete cascade.
  templates.ts     applyTomeTemplate, createPlotFromTemplate. Create-time only.
  elementTypes.ts  Types, field definitions, and the two count* helpers.
  elements.ts      Elements + relationships.
  spine.ts         The shared row axis. Owns every sortOrder/plotRowId write.
  plots.ts         Plots and beats. Defers to spine.ts for ordering.
  writeItems.ts    Prose rows + the beat↔text link (both sides of writeItemIds).
  __tests__/       vitest + fake-indexeddb. See below.
```

**`spine.ts` is the boundary that enforces the spine rule**, and the reason the
split is not purely by table. Row ranks and `PlotItem.plotRowId` are written
*only* there, so "never author `sortOrder` from an index" is a module boundary
rather than a comment someone can miss. `plots.ts` imports `syncPlotSortOrder`
and `rowForNewPlotItem` from it; `spine.ts` imports nothing back.

Two kinds of exports, and they're used differently:

- **`store.observe*(…, callback)`** wraps Dexie `liveQuery` and returns a
  `Subscription`. Never call these in a `useEffect` by hand — pass them to
  `useObservable`, which owns the subscribe/unsubscribe and the re-subscribe on
  dep change. A page reads `store.observeWriteItems(tomeId, cb)`; a Context
  does the same for state many pages share.
- **`store.save*` / `store.delete*` / `store.apply*`** are plain async
  mutations. Because every read is a live query, a mutation needs no manual
  refresh — the UI updates itself. Don't add local "optimistic" copies of
  saved data.

Validation is deliberately **not** inside the mutations: `validateElement`,
`validateFields`, `validatePlotItem`, and `validateRelationship` are exported
separately and called by the form before saving, so the thrown message can be
rendered as the dialog's inline error. Follow that split for new entities.

Shared conventions across the modules:

- Ids are `crypto.randomUUID()`. Timestamps are **ISO strings**
  (`new Date().toISOString()`), never `Date` objects — they are stored,
  indexed, and sorted as strings.
- Manual ordering is an integer `sortOrder` compacted by the `applyOrder`
  helper (assigns `sortOrder = index`). Call it inside the transaction. **The one
  exception is `plotItems`** — see the spine section below, where `sortOrder` is
  derived from row order rather than authored directly.
- Cascades run in `db.transaction("rw", …)` listing every table touched.
  Deleting a tome clears all eight tables; deleting an Element also strips its
  id from relationships and from every beat's `attachedElementIds` via the
  multiEntry index (`detachElements`); deleting a WriteItem does the same
  through `detachWriteItem`.
- Reads out of `plotItems` go through `readPlotItem`, which defaults the two id
  arrays. That is belt-and-braces on top of the migration — a database that
  missed an upgrade must degrade to an empty list, never blank a page. It does
  **not** default `plotRowId`: there is no sane stand-in for a row id, so that
  one leans on the v7 backfill being right, and a beat that somehow lacks one
  sorts to the end of its plot rather than silently claiming the top.

### The spine: `plotRows` is a tome-level axis, and `PlotItem.sortOrder` derives from it

A tome has **one ordered list of `PlotRow`s** — the spine. Every beat in every
plot of that tome stands on one of them (`PlotItem.plotRowId`, required). Two
beats on the same row are contemporaneous, which is what lets `PlotGrid` draw
several plots side by side with their beats aligned. **A gap is the absence of a
cell** — a plot with no beat on a row simply shows nothing there — which is why
this is a shared table rather than a number on each beat.

The rule that governs everything else: **row order is the truth, and
`PlotItem.sortOrder` is a cache of it.** `sortOrder` survives only so the
`[plotId+sortOrder]` index and every single-plot reader keep working untouched.
Consequences, all of them load-bearing:

- **Never write `plotItems.sortOrder` from an index.** End any mutation that
  touches rows or row assignments with `syncPlotSortOrder(tomeId)`, inside its
  transaction. It rewrites each beat's `sortOrder` from the rank of its row and
  skips rows already correct, so calling it after a no-op costs one read and
  fires no live query. `savePlotItem` calls it too: a beat created in a gap
  partway up the spine belongs at that point in its plot, and numbering it by
  insert index leaves the grid and the timeline disagreeing about where it sits.
- **`reorderPlotItems` permutes rows, it does not renumber.** Dragging within one
  plot reassigns which of its beats stands on each row it *already occupies*, so
  the set of occupied rows is unchanged and no other plot loses its alignment or
  gains a gap.
- **Inserting a row shifts the whole spine**, and every beat keeps the row id it
  already names — so all plots move together and stay aligned.
- **A plot can hold at most one beat per row.** `movePlotItemToRow` enforces it by
  swapping when the target cell is already taken.
- **Deleting a beat leaves its row standing** (that is the gap it becomes), so the
  spine only ever grows. `removeEmptyPlotRows(tomeId)` is the housekeeping that
  drops rows *no plot in the tome* occupies — note "no plot", not "no visible
  column", so it can be a no-op while the screen is full of gaps.
- **`deletePlotRow` reaches across every plot** and takes each beat standing on
  the row. It is the one plot mutation that is destructive beyond the plot you are
  looking at; `countPlotRowBeats` exists to tell the confirm dialog the cost.

New beats pick their row in `rowForNewPlotItem`: inserting between two beats opens
a fresh row above the one displaced, while appending reuses the next row the plot
leaves empty and only grows the spine when there is none — so writing straight
down one plot does not strand its beats below everyone else's.

### `services/__tests__/` — how to test this layer

`fake-indexeddb/auto` is installed once, in `setup.ts`. Because `db` is a module
singleton created at import time, **isolation means wiping the database, not
re-importing the module**: `beforeEach` does `db.delete()` then `db.open()`,
which replays v1→v7 and so exercises the real schema on every test.

- **`expectSpineIntact(tomeId)` in `helpers.ts` is the important assertion.**
  It checks the whole spine contract at once — every beat stands on a live row,
  a plot holds at most one beat per row, and each plot's `sortOrder` values are
  exactly the ranks of its rows compacted from 0. Assert it after *every*
  mutation that could touch rows or row assignments; a regression in any of the
  eight plot mutations trips it. `columnOf(tomeId, plotId)` renders a plot
  against the spine as `["a1", null, "a2"]`, which is what the grid draws, so
  alignment expectations should be written in that shape.
- **Migrations are tested by building an *older* database.** `migrations.test.ts`
  opens a plain Dexie under its own name with the v4 or v6 schema, seeds it,
  closes it, and opens `MyTomeDB` over the top — the only way to make Dexie
  actually replay an `.upgrade()`. `MyTomeDB`'s `name` constructor parameter
  exists for exactly this.
- Re-running a backfill (rule 4's remedy below) is tested by calling
  `backfillPlotRows` directly inside a transaction, since Dexie will never
  replay an upgrade for a version already applied. That is why the two backfill
  functions are exported from `models/db.ts`.
- **Don't test the `observe*` wrappers.** They are four-line `liveQuery` shells;
  testing them tests Dexie. Test the mutation and read the table.

### Two vestigial things — don't build on them

- **`Element.deletedAt` is never written.** `observeElements` filters
  `!x.deletedAt`, but `deleteElement` hard-deletes the row. There is no soft
  delete, no trash, and no restore. Either wire it up deliberately or leave it;
  don't half-assume it works.
- **The `activities` table has no reader and no writer.** It was declared back
  in schema v2 and nothing in `src/` outside `db.ts` mentions it. There is no
  activity feed.

## Dexie schema changes — read before editing `models/db.ts`

The database is `myTomeDB`, currently at **version 7**, and it is running in
users' browsers. The rules:

1. **Never edit a shipped `.version(n).stores({…})` block.** Add a new
   `.version(n+1)`. Dexie replays versions in order to upgrade an existing
   database; rewriting history desynchronizes anyone who already opened an
   older one.
2. **A new *table* needs no upgrade function** (v4 added `plots`/`plotItems`
   and has none). **A new *field* on an existing table usually does** — v5
   added `writeItemIds`, and both the `*writeItemIds` multiEntry index and
   every reader require an array, never `undefined`.
3. Write backfills to be **idempotent** (`item.writeItemIds ??= []`) so
   re-running them is free.
4. **v6 exists as a bug fix, and it is worth understanding before you repeat
   it.** v5 shipped briefly without its `.upgrade()` attached. Dexie never
   re-runs an upgrade for a version already applied, so those databases are
   stamped v5 with un-backfilled rows and no later change would ever reach
   them. v6 changes nothing and re-runs the same backfill purely for them. If
   you ship a version whose upgrade was missing or wrong, this is the remedy: a
   new no-op version carrying the corrected upgrade.
5. **v7 added the spine**, and shows both halves of rule 2 at once: `plotRows` is
   a new table (no upgrade needed on its own) but `plotRowId` is a new field on
   `plotItems` (which is). Its `backfillPlotRows` gives each tome a spine as deep
   as its longest plot and assigns beats by position — reproducing the implicit
   index-parity the old side-by-side compare view already drew, which is the only
   alignment the pre-v7 data can justify. It is resumable as well as idempotent:
   rows are topped up to the depth needed rather than recreated, and a beat that
   already names a row is skipped.

## Naming — these are load-bearing

- A book is a **Tome**, not a Story or a Project. The `:tomeId` route param and
  the `tomes` table follow.
- **`Plot`/`PlotItem`, never `Timeline`/`TimelineItem`** for records — `@mui/lab`
  exports components under those names and the collision would force an import
  alias everywhere. Only the components that *render* MUI timeline markup carry
  timeline vocabulary.
- **"Spine" means the tome's shared row axis — nothing else.** The vertical line
  MUI draws down a timeline is the **track**, and `PlotItem.name` (labelled "Beat
  label" in the dialog) is the **beat label** beside it. These three were all
  called "spine" before `PlotRow` existed; don't reintroduce the collision.
- **`WriteItem`** is the prose record; its `type` is a closed four-way union
  (`snippet | lore | passage | chapter`), not a user-extensible registry the way
  `ElementType` is.
- `Element` is the app's own domain type and shadows the DOM's `Element`.
  That is intentional and pervasive; import it explicitly rather than renaming.

## Routes are the dialog state

Dialogs and edit forms are **URL-addressable**, not `useState` booleans. The
pattern: one page component, mounted by several routes, taking a boolean prop.
`/tomes` and `/tomes/new` both render `<TomeLibraryPage>`, the second with
`creating`; `elements/:typeId/:elementId/edit`, `plots/:plotId/items/:itemId`,
and `elements/settings/new` work the same way. New create/edit UI should get a
route rather than a local open/closed flag — back, refresh, and deep links are
expected to work.

The deliberate exception is `write/:writeItemId`, which has **no `write/new`
sibling**: a draft row is created at the click site and the editor opens on its
real id, because a create-on-mount effect fires twice under `StrictMode`. See
`src/components/AGENTS.md` for the full autosave/discard story.

**Compare takes a comma-joined list of plots**, not a pair:
`plots/compare/:plotIds` (plus `/items/:itemId`, `/rows/:rowId`, and
`/insert/:sidePlotId` with an optional `/:rowId`). Any number of columns is a
link like everything else here. The list is canonical — `PlotComparePage` drops
unknown and repeated ids and rewrites the URL, and anything left with fewer than
two plots falls back to the single-plot view, since a plot compared with itself
is not a comparison. The insert route names the plot *and* the row because with
several columns on screen neither alone identifies a cell; omitting the row
appends instead. The old `plots/:plotId/compare/:otherPlotId` routes were
removed outright rather than redirected.

`StrictMode` is on in `main.tsx`. Assume every effect mounts, cleans up, and
mounts again in dev, and write effects that survive it.

## UI rules (summary — details in `src/components/AGENTS.md`)

- React 19 function components with hooks. No class components, no web
  components. The app was a Lit codebase until `89c4d13`; there is no
  `CustomEvent` bubbling, no `dispatchEvent`, and no `request-confirm` pattern
  left. Pass callbacks as props, or use Context.
- **MUI for everything.** There are zero `.css` files in the repo and it should
  stay that way — style with `sx` / `styled()` and theme tokens. Never hardcode
  a hex color (the permanently-dark `SideNav` is the one sanctioned exception),
  and never hand-write an inline `<svg>` icon; use `@mui/icons-material`.
- Anything destructive goes through `useConfirm()`'s `confirmAction`.
- State: Context for what is shared (`TomesContext`, `TomeWorkspaceContext`,
  `ConfirmContext`, `ColorModeContext`), plain `useState` for page-local UI.
  No Redux, no Zustand.

## The other Markdown files are history, not spec

- **`REQUIREMENTS.md` and `ARCHITECTURE.md` predate the React rewrite and the
  rename.** They call the product *WriteMap*, describe *Lit* components, and
  propose a `StoreService`/`DatabaseService` split plus an `elementSchemas.ts`
  registry that were never built (element schemas became per-tome
  `ElementType.fieldDefinitions` rows instead). ARCHITECTURE.md even ends with
  open questions the code answered long ago. Read them for intent; trust `src/`
  for fact.
- **`PLAN.md` is the Write-feature plan and it shipped** (`5838797`,
  `c126ea5`). It is an excellent record of *why* the editor autosaves and why
  composition is ordered, but it is not a to-do list.
- `wireframes/` holds the original PDF sketches and a vanilla-JS timeline
  spike. Reference material only.

When you learn something durable and non-obvious about this codebase, add it to
the relevant AGENTS.md — root for data, build, and routing; `src/components/`
for UI.
