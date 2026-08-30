# myTome

A local-first novel-writing workspace. An author creates **Tomes** (books),
defines their own **ElementTypes** (Character, Place, Faction, …) with custom
fields, fills them with **Elements**, links elements with **Relationships**,
lays out **Plots** as ordered **PlotItem** beats on a timeline, aligns those
plots against each other on a shared axis of **PlotRows**, and writes prose as
**WriteItems** in a Lexical editor.

**There is no backend.** No server, API, auth, or runtime network calls —
everything lives in the browser's IndexedDB via Dexie, shipped as a static
bundle on GitHub Pages. Don't reach for `fetch`, environment secrets, or a
data-fetching library; if a feature seems to need a server, say so rather than
inventing one.

`CLAUDE.md` is just `@AGENTS.md`, so this file is canonical whichever entry
point an agent loads. `src/components/AGENTS.md` is a deeper, UI-scoped
companion — read it before touching `src/components`, `src/pages`, or
`src/lexical`.

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

**Two gates: `npm run build` and `npm test`.** There is no ESLint or Prettier
config; the `eslint-disable` comments scattered through `src/` are leftovers
that nothing enforces.

- Run `npm run build` after a change. `tsc` runs first, and `noUnusedLocals`,
  `noUnusedParameters`, and `noFallthroughCasesInSwitch` are **errors** — a
  leftover import or abandoned variable fails the build. `tsconfig.json`
  includes all of `src`, so the tests are type-checked here too.
- **The suite covers `src/services`, `models/db.ts`, `hooks/autosave.ts`, and
  `lexical/blocks.ts`.** Still no component or page tests and **no jsdom** —
  `test.environment` is `node` and `include` is `src/**/*.test.ts`, so a
  `.test.tsx` would not even be collected. UI tests would mean adding a DOM
  environment and React Testing Library — don't, unless asked.
- **That is why `hooks/autosave.ts` holds no React and no DOM.** The Write
  editor's autosave timing was pulled out of the page precisely so its rules
  could be driven under `vi.useFakeTimers()` in the `node` environment instead
  of through a mounted page with Lexical and the store stubbed. Reach for the
  same split when logic worth testing is trapped in a component: extract the
  part that is only data and timers, and leave the React binding thin enough
  not to need a test.
- **`lexical/blocks.ts` is the second instance of that split**, and shows it
  works outside `hooks/`: it turns a stored Lexical document into a plain
  descriptor tree with no React and no DOM, so the format bitmask, list nesting
  and check state are all driven from `node`, while `components/StaticProse.tsx`
  stays a thin renderer. `lexical` itself imports cleanly under `node` — the
  test decodes formats against the library's own `IS_BOLD`/`IS_ITALIC`/… exports
  rather than hardcoded bit values.
- For UI behavior, run the app and drive it. Use the `myTome` launch config,
  not a hand-started Vite.
- Don't add a linter or formatter unless asked. Match surrounding formatting by
  eye (2-space indent, double quotes, trailing commas, semicolons).

TypeScript is in bundler mode with `verbatimModuleSyntax` and
`erasableSyntaxOnly`: type-only imports **must** use `import type { … }`, and
`enum`, parameter properties, and namespaces are compile errors. Use
string-literal unions and `const` objects, as the codebase already does
(`WriteItemType`, `TomeStatus`, `FieldKind`).

## Deployment

`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages and is
**`workflow_dispatch` only** — deploys are manual on purpose (`a4a7493`
removed the push trigger). Pushing to `main` ships nothing.

The site is served from a subpath, so `vite.config.ts` sets `base: "/myTome/"`.
That subpath is also why the router is `HashRouter`: Pages has no rewrite rule,
so a real deep link would 404. Every URL looks like `#/tomes/:tomeId/...`.
Don't switch router types without solving that.

## Layout

```
src/
  models/      Data shapes + the two template registries. Only db.ts declares the Dexie schema.
  services/    The data layer, split by table behind the store.ts barrel. Tests in __tests__/.
  hooks/       useObservable.ts (Dexie liveQuery → React state) and the
               autosave machine: autosave.ts is framework-free and tested,
               useAutosave.ts binds it to React. Tests in __tests__/.
  context/     App-wide state: tomes, current workspace, confirm dialog, color mode.
  layouts/     WorkspaceLayout.tsx — the /tomes/:tomeId/* shell (nav + header + Outlet).
  pages/       Route-level screens, one per <Route> in App.tsx.
  components/  Reusable UI. Has its own AGENTS.md — read it.
  lexical/     Custom Lexical nodes and plugins (mentions, toolbars), plus
               blocks.ts — the framework-free document reader, tested in
               __tests__/.
  theme.ts     getTheme(mode) — the warm-paper brand palette, light and dark.
```

### The one layering rule

**`src/models/db.ts` is imported only by files in `src/services/`.** Pages,
components, and contexts call `store`, never `db`. That boundary is what makes
the schema-migration rules below tractable. (It read "by exactly one file"
until `store.ts` was split; the boundary moved from a file to a directory, and
nothing outside it moved.)

## `services/` — the data layer

`store.ts` is a **barrel**, not the implementation: it spreads one object per
domain module into the single `store` the app imports. Consumers still write
`import { store } from "…/services/store"` and call `store.savePlotItem` — the
split is invisible outside this directory and should stay that way.

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

**`spine.ts` is why the split is not purely by table.** Row ranks and
`PlotItem.plotRowId` are written *only* there, making "never author `sortOrder`
from an index" a module boundary rather than a comment someone can miss.
`plots.ts` imports `syncPlotSortOrder` and `rowForNewPlotItem` from it;
`spine.ts` imports nothing back.

Two kinds of export:

- **`store.observe*(…, callback)`** wraps Dexie `liveQuery` and returns a
  `Subscription`. Never subscribe by hand in a `useEffect` — pass these to
  `useObservable`, which owns subscribe/unsubscribe and re-subscribe on dep
  change. Pages use them directly; Contexts do the same for shared state.
- **`store.save*` / `store.delete*` / `store.apply*`** are plain async
  mutations. Every read is a live query, so a mutation needs no manual refresh —
  don't add local "optimistic" copies of saved data.

Validation is deliberately **outside** the mutations: `validateElement`,
`validateFields`, `validatePlotItem`, and `validateRelationship` are exported
separately and called by the form before saving, so the thrown message can be
rendered as the dialog's inline error. Follow that split for new entities.

Shared conventions:

- Ids are `crypto.randomUUID()`. Timestamps are **ISO strings**
  (`new Date().toISOString()`), never `Date` objects — they are stored,
  indexed, and sorted as strings.
- Manual ordering is an integer `sortOrder` compacted by `applyOrder`
  (`sortOrder = index`), called inside the transaction. **`plotItems` is the
  one exception** — see the spine section.
- Cascades run in `db.transaction("rw", …)` listing every table touched.
  Deleting a tome clears all eight tables; deleting an Element also strips its
  id from relationships and from every beat's `attachedElementIds` via the
  multiEntry index (`detachElements`); deleting a WriteItem does the same via
  `detachWriteItem`.
- Reads out of `plotItems` go through `readPlotItem`, which defaults the two id
  arrays — belt-and-braces over the migration, so a database that missed an
  upgrade degrades to an empty list, not a blank page. It does **not** default
  `plotRowId` (no sane stand-in for a row id); that leans on the v7 backfill,
  and a beat lacking one sorts to the end of its plot rather than silently
  claiming the top.

### The spine: `plotRows` is a tome-level axis, and `PlotItem.sortOrder` derives from it

A tome has **one ordered list of `PlotRow`s** — the spine. Every beat in every
plot stands on one (`PlotItem.plotRowId`, required). Two beats on the same row
are contemporaneous, which is what lets `PlotGrid` draw plots side by side with
beats aligned. **A gap is the absence of a cell** — a plot with no beat on a row
shows nothing there — hence a shared table rather than a number on each beat.

The governing rule: **row order is the truth, and `PlotItem.sortOrder` is a
cache of it.** `sortOrder` survives only so the `[plotId+sortOrder]` index and
every single-plot reader keep working untouched. Every consequence below is
load-bearing:

- **Never write `plotItems.sortOrder` from an index.** End any mutation touching
  rows or row assignments with `syncPlotSortOrder(tomeId)`, inside its
  transaction. It rewrites each beat's `sortOrder` from its row's rank and skips
  rows already correct, so a no-op call costs one read and fires no live query.
  `savePlotItem` calls it too: a beat created in a gap partway up the spine
  belongs at that point in its plot, and numbering by insert index leaves the
  grid and the timeline disagreeing about where it sits.
- **`reorderPlotItems` permutes rows, it does not renumber.** Dragging within one
  plot reassigns which of its beats stands on each row it *already occupies*, so
  the occupied set is unchanged and no other plot loses alignment or gains a gap.
- **Inserting a row shifts the whole spine**, and every beat keeps the row id it
  already names — all plots move together and stay aligned.
- **A plot holds at most one beat per row.** `movePlotItemToRow` enforces this by
  swapping when the target cell is taken.
- **Deleting a beat leaves its row standing** (that is the gap), so the spine only
  grows. `removeEmptyPlotRows(tomeId)` drops rows *no plot in the tome* occupies —
  "no plot", not "no visible column", so it can be a no-op while the screen is
  full of gaps.
- **`deletePlotRow` reaches across every plot**, taking each beat on that row —
  the one plot mutation destructive beyond the plot you are looking at.
  `countPlotRowBeats` tells the confirm dialog the cost.

`rowForNewPlotItem` picks a new beat's row: inserting between two beats opens a
fresh row above the one displaced; appending reuses the next row the plot leaves
empty and grows the spine only when there is none — so writing straight down one
plot doesn't strand its beats below everyone else's.

### `services/__tests__/` — how to test this layer

`fake-indexeddb/auto` is installed once, in `setup.ts`. Because `db` is a module
singleton created at import time, **isolation means wiping the database, not
re-importing the module**: `beforeEach` does `db.delete()` then `db.open()`,
replaying every schema version so each test exercises the real schema.

- **`expectSpineIntact(tomeId)` in `helpers.ts` is the important assertion.** It
  checks the whole contract at once — every beat on a live row, at most one beat
  per row per plot, and each plot's `sortOrder` values exactly the ranks of its
  rows compacted from 0. Assert it after *every* mutation that could touch rows
  or row assignments; a regression in any of the eight plot mutations trips it.
  `columnOf(tomeId, plotId)` renders a plot against the spine as
  `["a1", null, "a2"]` — what the grid draws — so write alignment expectations in
  that shape.
- **Migrations are tested by building an *older* database.** `migrations.test.ts`
  opens a plain Dexie under its own name with the v4 or v6 schema, seeds it,
  closes it, then opens `MyTomeDB` over the top — the only way to make Dexie
  actually replay an `.upgrade()`. `MyTomeDB`'s `name` constructor parameter
  exists for exactly this.
- Re-running a backfill (rule 4's remedy) is tested by calling `backfillPlotRows`
  directly inside a transaction, since Dexie never replays an upgrade for an
  applied version — which is why the two backfill functions are exported from
  `models/db.ts`.
- **Don't test the `observe*` wrappers.** They are four-line `liveQuery` shells;
  testing them tests Dexie. Test the mutation and read the table.

### Two vestigial things — don't build on them

- **`Element.deletedAt` is never written.** `observeElements` filters
  `!x.deletedAt`, but `deleteElement` hard-deletes the row. There is no soft
  delete, trash, or restore. Wire it up deliberately or leave it — don't
  half-assume it works.
- **The `activities` table has no reader and no writer.** Declared in schema v2;
  nothing outside `db.ts` (and the schema literal in `migrations.test.ts`)
  touches it. There is no activity feed.

## Dexie schema changes — read before editing `models/db.ts`

The database is `myTomeDB`, at **version 7**, running in users' browsers.

1. **Never edit a shipped `.version(n).stores({…})` block.** Add
   `.version(n+1)`. Dexie replays versions in order to upgrade an existing
   database; rewriting history desynchronizes anyone who already opened an
   older one.
2. **A new *table* needs no upgrade function** (v4 added `plots`/`plotItems`
   with none). **A new *field* on an existing table usually does** — v5 added
   `writeItemIds`, and both the `*writeItemIds` multiEntry index and every
   reader require an array, never `undefined`.
3. Make backfills **idempotent** (`item.writeItemIds ??= []`) so re-running them
   is free.
4. **v6 exists as a bug fix — understand it before repeating it.** v5 shipped
   briefly without its `.upgrade()` attached, and Dexie never re-runs an upgrade
   for an applied version, so those databases sit at v5 with un-backfilled rows
   no later change would reach. v6 changes nothing and re-runs the same backfill
   purely for them. That is the remedy for a missing or wrong upgrade: a new
   no-op version carrying the corrected one.
5. **v7 added the spine**, showing both halves of rule 2: `plotRows` is a new
   table (no upgrade needed) but `plotRowId` is a new field on `plotItems`
   (which is). `backfillPlotRows` gives each tome a spine as deep as its longest
   plot and assigns beats by position — reproducing the implicit index-parity the
   old side-by-side compare view drew, the only alignment pre-v7 data can
   justify. It is resumable as well as idempotent: rows are topped up rather than
   recreated, and a beat that already names a row is skipped.

## Naming — these are load-bearing

- A book is a **Tome**, not a Story or a Project. The `:tomeId` route param and
  the `tomes` table follow.
- **`Plot`/`PlotItem`, never `Timeline`/`TimelineItem`** for records — `@mui/lab`
  exports components under those names, and the collision would force an import
  alias everywhere. Only components that *render* MUI timeline markup carry
  timeline vocabulary.
- **"Spine" means the tome's shared row axis — nothing else.** The vertical line
  MUI draws down a timeline is the **track**; `PlotItem.name` (labelled "Beat
  label" in the dialog) is the **beat label** beside it. All three were called
  "spine" before `PlotRow` existed; don't reintroduce the collision.
- **`WriteItem`** is the prose record; its `type` is a closed four-way union
  (`snippet | lore | passage | chapter`), not a user-extensible registry the way
  `ElementType` is.
- `Element` is the app's own domain type and shadows the DOM's `Element`. That is
  intentional and pervasive; import it explicitly rather than renaming.

## Routes are the dialog state

Dialogs and edit forms are **URL-addressable**, not `useState` booleans. The
pattern: one page component mounted by several routes, taking a boolean prop.
`/tomes` and `/tomes/new` both render `<TomeLibraryPage>`, the second with
`creating`; `elements/:typeId/:elementId/edit`, `plots/:plotId/items/:itemId`,
and `elements/settings/new` work the same way. New create/edit UI gets a route,
not a local open/closed flag — back, refresh, and deep links must work.

The deliberate exception is `write/:writeItemId`, which has **no `write/new`
sibling**: a draft row is created at the click site and the editor opens on its
real id, because a create-on-mount effect fires twice under `StrictMode`. See
`src/components/AGENTS.md` for the full autosave/discard story.

**Writing happens on an overlay, and both writing routes stay under
`WorkspaceLayout`.** `write/:writeItemId` (one text) and
`plots/:plotId/items/:itemId/write` (a beat's composed text as one manuscript)
both render a `FocusSurface` — a MUI `Dialog` over the workspace with a dimmed
scrim. Keeping them inside the layout is what leaves the app visible behind the
backdrop, and it also keeps `TomeWorkspaceContext` in scope, which the editor
needs for `types` (the mentions plugin). Below `sm` the same surface goes
full-bleed, because at that width `SideNav` is already a horizontal strip and
there is nothing worth dimming.

**A beat's manuscript has exactly one address.** There is no
`plots/compare/:plotIds/items/:itemId/write` variant — `PlotComparePage` links
at `plots/:plotId/items/:itemId/write` using the beat's own `plotId`, and the
back button returns to the comparison. Resist adding a compare-scoped twin; the
route shape is already three deep.

**Compare takes a comma-joined list of plots**, not a pair:
`plots/compare/:plotIds` (plus `/items/:itemId`, `/rows/:rowId`, and
`/insert/:sidePlotId` with an optional `/:rowId`). Any number of columns is just
a link. The list is canonical — `PlotComparePage` drops unknown and repeated ids
and rewrites the URL, and fewer than two plots falls back to the single-plot
view, since a plot compared with itself is not a comparison. The insert route
names the plot *and* the row because with several columns neither alone
identifies a cell; omitting the row appends. The old
`plots/:plotId/compare/:otherPlotId` routes were removed outright, not
redirected.

`StrictMode` is on in `main.tsx`. Assume every effect mounts, cleans up, and
mounts again in dev, and write effects that survive it.

## UI rules (summary — details in `src/components/AGENTS.md`)

- React 19 function components with hooks. No class components, no web
  components. The app was Lit until `89c4d13`; no `CustomEvent` bubbling, no
  `dispatchEvent`, and no `request-confirm` pattern remains. Pass callbacks as
  props, or use Context.
- **MUI for everything.** There are zero `.css` files in the repo and it should
  stay that way — style with `sx` / `styled()` and theme tokens. Never hardcode a
  hex color (the permanently-dark `SideNav` is the one sanctioned exception), and
  never hand-write an inline `<svg>` icon; use `@mui/icons-material`.
- Anything destructive goes through `useConfirm()`'s `confirmAction`.
- State: Context for what is shared (`TomesContext`, `TomeWorkspaceContext`,
  `ConfirmContext`, `ColorModeContext`), plain `useState` for page-local UI. No
  Redux, no Zustand.

When you learn something durable and non-obvious about this codebase, add it to
the relevant AGENTS.md — root for data, build, and routing; `src/components/`
for UI.
