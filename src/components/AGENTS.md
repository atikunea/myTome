# src/components

Shared UI building blocks for myTome (React 19 + TypeScript + MUI, function
components with hooks — no class components, no web components). This
folder holds pieces reused across routes (`SideNav`, `AppHeader`,
`TomeFormDialog`, `FieldDefinitionsEditor`, `CoverThumbnail`, `ImagePicker`,
`EmptyState`, `ColorModeToggle`, `TimelineCard`, `TimelineConnectorInsert`,
`PlotItemDialog`, `PlotPicker`). Route-level screens live in `../pages`
instead — a good
rule of thumb is: if it's mounted directly by a `<Route>` in `App.tsx`, it's
a page; if it's composed *into* a page (or into the workspace layout), it
belongs here.

`CLAUDE.md` in this directory is just `@AGENTS.md` — this file is the
canonical source regardless of which entry point an agent loads.

## Component shape

Plain function components, one per file, named to match the export
(`TomeFormDialog.tsx` → `export function TomeFormDialog(...)`). Styling is
done with MUI's `sx` prop / `styled()` and the theme in `src/theme.ts` —
**do not** write standalone `.css` files or hand-rolled class-name
stylesheets; reach for an MUI component (`Card`, `Dialog`, `Chip`, `Stack`,
`TextField`, icons from `@mui/icons-material`, …) before writing bespoke
markup. That preference (MUI over homemade) is deliberate project policy,
not just a style nit.

## Naming: `Plot` is the record, `Timeline` is how it's drawn

The plotting feature's domain records are `Plot` and `PlotItem` (`models/Plot.ts`,
the `plots`/`plotItems` tables, `store.savePlotItem`, the `/plots/:plotId`
routes). They are deliberately **not** named `Timeline`/`TimelineItem`, because
`@mui/lab` exports components by those names and the collision would force an
import alias in every file that touched both. Keep it that way: no file should
need to alias `@mui/lab`'s `TimelineItem`.

The two components that exist only to emit MUI timeline markup — `TimelineCard`
and `TimelineConnectorInsert` — keep timeline vocabulary, since they are named
for what they render rather than for the record they display.

## State: Context for shared state, local state for page-local UI

This app uses React Context (not Redux/Zustand) for state that's shared
across the component tree:

- `context/ColorModeContext.tsx` — light/dark mode + the MUI `ThemeProvider`/
  `CssBaseline` wiring.
- `context/ConfirmContext.tsx` — the single app-wide confirm dialog. Call
  `useConfirm()` to get `confirmAction(text, action)`; it renders the MUI
  `Dialog` itself. This replaced the old Lit `request-confirm` custom-event
  bubbling pattern entirely — components call `confirmAction` directly, no
  events needed.
- `context/TomesContext.tsx` — the live (Dexie `liveQuery`) list of all
  Tomes, via `useTomes()`.
- `context/TomeWorkspaceContext.tsx` — the current Tome + its ElementTypes
  for whatever `:tomeId` is in the URL, via `useTomeWorkspace()`. Provided by
  `layouts/WorkspaceLayout.tsx`, which is the layout route element for
  `/tomes/:tomeId/*`.

Page-local UI state (search text, sort order, grid/list toggle, form error
messages) stays as plain `useState` in the page component — it does not need
a Context. Element lists for a given type are fetched with the
`useObservable` hook directly in `ElementListPage`, not lifted into a
Context, since only that page needs them.

`hooks/useObservable.ts` is the generic adapter between Dexie's
`liveQuery`-based `store.observe*` functions (unchanged from before — see
`services/store.ts`) and React state. Contexts and pages both use it instead
of duplicating subscribe/unsubscribe `useEffect` boilerplate.

## Talking to parents: props and context, not custom events

Unlike the old Lit version, components here are regular React components:
pass callbacks down as props (`onEdit`, `onDelete`, `onChange`), or reach
into Context for anything that isn't a direct parent/child relationship.
There is no `CustomEvent`/`dispatchEvent`/`bubbles: true` pattern anymore —
if a past agent's mental model is "dispatch and let a distant ancestor
listen," that no longer applies.

`FieldDefinitionsEditor` no longer needs the old Lit "keep a local `working`
copy synced in `willUpdate`" workaround for stale-async-property races —
that was specific to Lit's batched microtask property updates. In React, the
parent (`ElementTypesPage`) just owns the `fields` array in `useState` and
passes it straight through as a controlled prop; mutations flow back
synchronously via `onChange`.

## Routing

`react-router-dom` (`HashRouter`) replaced the hand-rolled
`location.hash`-parsing router that used to live in `app-shell.ts`. Routes
are declared in `src/App.tsx`; the exact `#/tomes/...` URL scheme from the
Lit version was preserved on purpose (bookmarks/back-button behavior should
be unaffected). `layouts/WorkspaceLayout.tsx` is the nested layout route for
everything under `/tomes/:tomeId/*` (side nav + header + `<Outlet/>`).

## Styling conventions

- Brand palette lives in `src/theme.ts` (`getTheme(mode)`), seeded from the
  app's original warm paper/brown palette, with a matching dark variant.
  Don't hardcode hex colors in components — use theme tokens
  (`text.secondary`, `divider`, `background.default`, `primary.main`, etc.)
  or MUI's semantic color props (`color="error"`, `color="warning"`) so both
  light and dark mode stay correct automatically.
- The one exception is `SideNav`, which is intentionally always dark
  (`#27201c`) regardless of the app's light/dark mode toggle — that matches
  the original design, which had a permanently-dark sidebar.
- The one responsive breakpoint used everywhere is MUI's default `sm`
  (600px), typically via `sx={{ flexDirection: { xs: "column", sm: "row" } }}`
  — match this instead of inventing new breakpoints.
- No hand-written inline `<svg>` icons — use `@mui/icons-material`.

## Current components

- `SideNav.tsx` — per-tome left nav; lists the tome's ElementTypes. Reads
  `useTomeWorkspace()`.
- `AppHeader.tsx` — per-tome workspace header (title + back link + edit
  link). Reads `useTomeWorkspace()`.
- `TomeFormDialog.tsx` — create/edit dialog for a Tome, used by both
  `TomeLibraryPage` (`/tomes/new`) and `TomeDashboardPage`
  (`/tomes/:id/edit`) — matches the original behavior where editing a tome
  always lands you on that tome's dashboard with the dialog open on top,
  regardless of where you clicked "Edit" from.
- `FieldDefinitionsEditor.tsx` — add/edit/remove UI for an ElementType's
  custom field definitions (`FieldDefinition[]`); used by
  `../pages/ElementTypesPage.tsx`.
- `CoverThumbnail.tsx` — shared cover image / fallback-letter-avatar,
  used by Tome and Element cards.
- `ImagePicker.tsx` — clickable image-or-placeholder tile used in the Tome
  and Element edit forms; opens a dialog to paste an image URL or upload a
  file (via `imageFrom`/`imageUrl` from `services/store.ts`, which already
  handle both). Used by `TomeFormDialog.tsx` and the edit form in
  `../pages/ElementListPage.tsx` in place of the old inline URL field +
  upload button, adding a live preview and the ability to remove an image.
- `ElementTypeIcon.tsx` — renders an `ElementType`'s chosen icon (falls back
  to a generic glyph when unset); also exports `elementTypeIconOptions`, the
  curated icon set used by the picker in `../pages/ElementTypesPage.tsx`.
  Used anywhere an ElementType's name is shown — `SideNav`, the type
  configuration cards/form, `ElementListPage` headers, and relationship rows.
  Plot items reuse it for their own `icon` key rather than standing up a second
  icon registry, so the name is a slight misnomer; the curated list also carries
  a few beat-shaped icons (`Repeat`, `Favorite`, `Warning`, `HourglassTop`) for
  that use.
- `TimelineCard.tsx` — one row of the plot timeline, used by
  `../pages/PlotPage.tsx`. It **returns a MUI `TimelineItem` as its own root**
  rather than wrapping one: `Timeline` hands its `position` down through React
  context, so an intervening element breaks the row's layout grid. The
  `@dnd-kit` sortable ref and transform therefore land on that `TimelineItem`.
  Its drag handle is a plain `Box component="button"`, **not** an `IconButton` —
  ButtonBase routes key events through its own `getButtonProps` wrapper, which
  swallows the `onKeyDown` that dnd-kit's `KeyboardSensor` needs to start a lift.
- `TimelineConnectorInsert.tsx` — a `TimelineConnector` that doubles as an
  insert point, revealing a "+" on hover/focus. The gap between two cards is
  two stacked connectors (the upper card's bottom, the lower card's top); both
  are handed the same insert index, so the whole gap acts as one target.
- `PlotItemDialog.tsx` — route-driven create/edit dialog for a `PlotItem`,
  including the multi-`Autocomplete` attachment picker. Attachments are plain
  associations to elements with no label — that is the whole difference from a
  `Relationship`, so do not grow a description field here.
- `PlotPicker.tsx` — tabs for switching between a tome's plots, plus
  create/rename/delete.
- `EmptyState.tsx` — shared "nothing here yet" placeholder.
- `ColorModeToggle.tsx` — fixed-position light/dark toggle, rendered once in
  `App.tsx` so it's available on every route.
