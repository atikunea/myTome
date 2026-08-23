# myTome

A local-first novel-writing workspace. An author creates **Tomes** (books),
defines their own **ElementTypes** (Character, Place, Faction, …) with custom
fields, fills them with **Elements**, links elements with **Relationships**,
lays out **Plots** as ordered **PlotItem** beats on a timeline, and writes prose
as **WriteItems** in a Lexical editor.

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

**`npm run build` is the only gate that exists.** There is no test suite, no
ESLint config, and no Prettier config — the `eslint-disable` comment in
`hooks/useObservable.ts` is a leftover and nothing enforces it. So:

- After a change, run `npm run build`. `tsc` runs first and the flags are
  strict about the things agents get wrong: `noUnusedLocals`,
  `noUnusedParameters`, and `noFallthroughCasesInSwitch` are all errors, so a
  leftover import or an abandoned variable **fails the build**, not just lints.
- To check behavior, run the app and drive it — there is nothing to assert
  against otherwise. Use the `myTome` launch config rather than starting Vite
  by hand.
- Don't add a test runner, linter, or formatter unless asked. Match the
  surrounding formatting by eye (2-space indent, double quotes, trailing
  commas, semicolons).

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
  services/    store.ts — the single data-access module (771 lines).
  hooks/       useObservable.ts — Dexie liveQuery → React state.
  context/     App-wide state: tomes, current workspace, confirm dialog, color mode.
  layouts/     WorkspaceLayout.tsx — the /tomes/:tomeId/* shell (nav + header + Outlet).
  pages/       Route-level screens, one per <Route> in App.tsx.
  components/  Reusable UI. Has its own AGENTS.md — read it.
  lexical/     Custom Lexical nodes and plugins (mentions, toolbar).
  theme.ts     getTheme(mode) — the warm-paper brand palette, light and dark.
```

### The one layering rule

**`src/models/db.ts` is imported by exactly one file: `src/services/store.ts`.**
Pages, components, and contexts never touch `db` directly — they call `store`.
Keep it that way; it is what makes the schema-migration rules below tractable.

## `services/store.ts` — the data layer

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

Shared conventions inside `store.ts`:

- Ids are `crypto.randomUUID()`. Timestamps are **ISO strings**
  (`new Date().toISOString()`), never `Date` objects — they are stored,
  indexed, and sorted as strings.
- Manual ordering is an integer `sortOrder` compacted by the `applyOrder`
  helper (assigns `sortOrder = index`). Call it inside the transaction.
- Cascades run in `db.transaction("rw", …)` listing every table touched.
  Deleting a tome clears all seven tables; deleting an Element also strips its
  id from relationships and from every beat's `attachedElementIds` via the
  multiEntry index (`detachElements`); deleting a WriteItem does the same
  through `detachWriteItem`.
- Reads out of `plotItems` go through `readPlotItem`, which defaults the two id
  arrays. That is belt-and-braces on top of the migration — a database that
  missed an upgrade must degrade to an empty list, never blank a page.

### Two vestigial things — don't build on them

- **`Element.deletedAt` is never written.** `observeElements` filters
  `!x.deletedAt`, but `deleteElement` hard-deletes the row. There is no soft
  delete, no trash, and no restore. Either wire it up deliberately or leave it;
  don't half-assume it works.
- **The `activities` table has no reader and no writer.** It was declared back
  in schema v2 and nothing in `src/` outside `db.ts` mentions it. There is no
  activity feed.

## Dexie schema changes — read before editing `models/db.ts`

The database is `myTomeDB`, currently at **version 6**, and it is running in
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

## Naming — these are load-bearing

- A book is a **Tome**, not a Story or a Project. The `:tomeId` route param and
  the `tomes` table follow.
- **`Plot`/`PlotItem`, never `Timeline`/`TimelineItem`** for records — `@mui/lab`
  exports components under those names and the collision would force an import
  alias everywhere. Only the components that *render* MUI timeline markup carry
  timeline vocabulary.
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
