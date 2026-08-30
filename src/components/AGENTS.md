# src/components

Shared UI building blocks for myTome (React 19 + TypeScript + MUI, function
components with hooks — no class components, no web components). This
folder holds pieces reused across routes (`SideNav`, `AppHeader`,
`TomeFormDialog`, `FieldDefinitionsEditor`, `CoverThumbnail`, `ImagePicker`,
`EmptyState`, `ColorModeToggle`, `PlotTimeline`, `PlotGrid`, `TimelineCard`,
`PlotBeatCard`, `TimelineConnectorInsert`, `PlotItemDialog`, `PlotPicker`,
`WriteItemCard`, `WriteItemTypeIcon`).
Lexical editor internals (custom nodes and plugins) live in `../lexical`
rather than here — they are not MUI components and only the Write editor
mounts them. Route-level screens live in `../pages`
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

The three components that exist only to emit MUI timeline markup —
`PlotTimeline`, `TimelineCard`, and `TimelineConnectorInsert` — keep timeline
vocabulary, since they are named for what they render rather than for the
record they display.

## Templates are seeds, not schemas — and there are two registries

`../models/TomeTemplate.ts` holds the registry behind the create dialog's
template picker — General (the historical starter set) plus Fantasy, Science
Fiction, Horror, Non-fiction, Biography, and Self-Help. Each entry lists the
element types to create, with their `FieldDefinition`s. **Element types only:**
tome templates used to carry a bespoke plot outline each, and no longer do. If a
past agent's mental model is "the Fantasy template seeds The Quest", that no
longer applies — plot outlines all come from the second registry.

`../models/PlotTemplate.ts` is that registry: the named story structures behind
the plot-template picker — Three-Act, Freytag, the Hero's Journey, Seven-Point,
Save the Cat, the Fichtean Curve, the Story Circle, Kishōtenketsu, Romance, and
Mystery, plus three Non-fiction outlines (Chapter Outline, Life Timeline,
Chapter Arc) that the retired tome-template plots left behind. Each is a flat
`TemplateBeat[]`, where `name` is the repeating beat label ("Act I", "Act I",
"Act II", …) that groups beats on the timeline. `noPlotTemplateId` is a real
option in the picker, not an empty value, and has no entry in the registry —
`plotTemplateById` returns undefined for it.

Both appliers run **once**, at creation, and only add rows:
`store.applyTomeTemplate(tomeId, templateId)` right after the tome row is
written, and `store.createPlotFromTemplate(tomeId, plotTemplateId, overrides)`
for each plot line. Nothing is stored saying which template made a tome or a
plot, nothing reads either registry afterward, and a second application would
stack a second copy — so don't grow these into "change a tome's template later"
or "re-apply a structure" without reconciliation to match. Template fields are
always created with `required: false`: an author sketching a character must
never be blocked by a field a template chose for them.

Both pickers are create-only. `TomeFormDialog` shows them side by side (the
element types an author needs is a question about genre; the shape of the story
is not), and `PlotPicker`'s "New plot" dialog shows the plot one alone. In that
dialog the name field is deliberately **optional whenever a structure is
chosen** — blank means "name it after the structure", which
`createPlotFromTemplate` resolves — and required when there is no structure to
borrow a name from.

The old `starterTypes` constant in `models/ElementType.ts` is gone; the
General template replaced it. If a past agent's mental model is "new tomes
get `starterTypes`", that no longer applies.

## A `PlotItem` *composes* `WriteItem`s — that is not an attachment

A plot item carries two very different id lists, and they must not be
conflated:

- `attachedElementIds` — an unordered set of elements involved in the beat.
  Order is meaningless; deduped; rendered as chips.
- `writeItemIds` — the beat's **manuscript text, in reading order**. A beat
  might hold an opening snippet, two passages, and the chapter itself. The
  order *is* the order the prose is read in, so it is authored (drag to
  reorder in `PlotItemDialog`) and must be preserved exactly. The same
  `WriteItem` may be composed into several beats, each with its own order.

Deleting a beat never deletes its composed `WriteItem`s — they are tome-level
content that merely stops being referenced. Deleting a `WriteItem` strips its
id from every beat via the `*writeItemIds` multiEntry index.

**Composition is edited in the beat's manuscript, not in `PlotItemDialog`.** The
dialog used to carry the whole ordered list and a `DndContext`, and had to call
`store.setPlotItemWriteItems` before navigating away so an unsaved reorder was
not lost — that defensive save is gone along with the navigation that motivated
it. The dialog now holds only what a beat *is* and how it is drawn, and
`savePlotItem` falls back to the stored `writeItemIds` when a caller omits them,
so saving from the dialog cannot disturb the composition. Reordering lives in
each section's overflow menu as "Move earlier"/"Move later" rather than on drag
handles: dragging a section of a scrolling manuscript whose rows differ hugely
in height is far more work than the handful of parts a beat holds justifies, and
menu items are keyboard-reachable for free.

Both destructive actions are offered in that menu and **named apart** — "Remove
from this beat" detaches, "Delete text permanently" removes the row from every
beat composing it. Do not collapse them into one control.

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

## The focus surface: one live editor, n static sections

Writing happens on `FocusSurface` — a MUI `Dialog` over the workspace with a
dimmed scrim (full-bleed below `sm`). Two pages mount it: `WriteEditorPage` with
one text, `BeatManuscriptPage` with a beat's `writeItemIds` drawn as one
continuous manuscript in reading order. Both hand their rows to
`ProseManuscript`, which is where the load-bearing part lives.

**Every section is static markup until it is clicked.** `ProseManuscript` mounts
exactly one `ProseEditor` — the surface's only `LexicalComposer` and its only
`useAutosave` machine. Everything else is `StaticProse` drawn from
`lexical/blocks.ts`. This is not primarily a performance decision; it is what
keeps `useAutosave` one machine writing one row, `SaveStatus` reporting one
unambiguous state, and the toolbar, mentions and history attached to an editor
without anything having to decide *which* editor.

Five things here will bite if you change them:

- **`manuscriptStyles.ts` is shared, and that is the premise.** `StaticProse`
  and the mounted `ContentEditable` both render from `manuscriptSx(face)`. If
  the two ever disagree — one `line-height` is enough — the prose jumps under
  the cursor on every click, *and* caret placement breaks, because the click
  point is resolved against the editor's DOM after the swap and only lands on
  the right word while the two renders occupy identical space. Verified in the
  browser: the same paragraph measured `{x:175, y:182, w:569, h:33}` in both
  states.
- **`StaticProse` reproduces Lexical's DOM deliberately**, not approximately:
  `getElementOuterTag`/`getElementInnerTag` (code→`<code>`, highlight→`<mark>`,
  sub/sup, then bold→`<strong>` else italic→`<em>` else `<span>`), the same
  `proseTextTheme` classes, the same
  `calc(N * var(--lexical-indent-base-value, 40px))` for indent, and a `<br>`
  inside an empty block. Each of those was read out of Lexical's source, not
  guessed.
- **`proseTextTheme` carries `bold` and `italic` for a real bug.** Lexical gives
  a text node one inner tag, bold before italic, so a run that is *both* renders
  as `<strong>` and its italic survives only as a theme class. The old editor
  theme defined neither, so bold italic silently lost its slant. Don't drop them.
- **The unmount flush is handed back through `flushRef`.** A page that sweeps
  blank drafts on close must `await flushRef.current` first, or a draft the
  author typed into still looks blank in the database and gets deleted. The
  editor's flush is therefore *not* deferred a tick; only the page's discard is,
  for the StrictMode reason below.
- **A section is redrawn from `edits`, not from the row.** When an editor
  unmounts, the manuscript already holds the text it last had; re-reading the
  row would flash the pre-edit text for a frame, because the write and its
  `liveQuery` echo are not synchronous.

Two smaller notes. Undo does not cross a section boundary — `HistoryPlugin`'s
stack dies with the editor, which is honest given autosave has already persisted
the previous section. And the active-section accent is a `::before` in the
gutter rather than a `border-left`: a real border would move the prose by a
pixel or two on activation, and at a phone width it clips off screen.

### Focus must never depend on an animation frame

`CaretAtPointPlugin` focuses the newly mounted section **synchronously**, and
only *refines* the caret position on the next frame. That order is deliberate
and was got wrong first time round: an earlier version did the whole thing
inside `requestAnimationFrame`, and where no frame arrives — a backgrounded tab,
a throttled compositor, the Browser pane during automated testing — the section
mounted, looked active, and silently swallowed everything the author typed,
with nothing to retry it.

Placing the caret has three separate traps, and all three produced the *same*
symptom — the caret sitting at the start of the block:

- **`caretPositionFromPoint` can return an element, not a text node**, and an
  element's `offset` is a child index. `range.setStart(p, 0)` is the start of
  the block. Only a text-node resolution is a hit; anything else must be treated
  as a miss so the retry runs.
- **Lexical overwrites a caret set only in the DOM.** Focusing the root makes
  Lexical queue an update, and when that commits a microtask later it reconciles
  the *editor state's* selection back onto the DOM. The placement has to go into
  the editor state — `$createRangeSelectionFromDom(domSelection, editor)` inside
  an `editor.update`, queued after the focus update so it has the last word.
- **The retry is a `setTimeout`, not an animation frame.** What the first
  attempt waits on is Lexical's reconciliation, which lands in a microtask, so a
  macrotask is both sufficient and — unlike a frame — guaranteed to arrive.
  `void root.getBoundingClientRect()` before each hit test forces the layout
  pass, since the static markup was removed in the same commit.

Worst case is a sane caret in a focused, typeable editor; none of the three
failures can cost the author a keystroke.

### Mentions: the typeahead needs a z-index on the focus surface

`LexicalTypeaheadMenuPlugin` appends its anchor to `<body>` with `z-index:
auto`. That was invisible while the editor was a plain page, and became a bug
the moment writing moved onto a `Dialog`: the menu was built correctly and
positioned correctly at the caret, and painted **behind** the surface, so typing
`@` looked like nothing happened at all. `MentionsPlugin`'s `Paper` therefore
carries `position: relative` and `zIndex: theme.zIndex.tooltip` — the anchor
sets no z-index and so creates no stacking context, which is what lets the paper
lift itself in the root one.

Everything else about mentions already worked across the split and still does:
`StaticProse` reproduces the `data-mytome-mention` attribute, `manuscriptStyles`
carries the one rule that colours them in both renders, and `ProseManuscript`
holds a single delegated click handler that serves the whole manuscript —
static sections and the mounted editor alike — rather than wiring anything per
node.

### `ProseToolbarPlugin` — the same toolbar, placed twice

`ToolbarPlugin` grew a `variant` prop. `"bar"` is the old sticky strip; `"bare"`
drops the chrome so something else can place the controls.
`ProseToolbarPlugin` picks by input, not width: a `Popper` pill over the
selection on a pointer device, and a strip docked above the keyboard (tracked
with `VisualViewport`) when `(pointer: coarse)` — a floating pill there would
fire on the same gesture as the OS copy-and-paste callout, whose position cannot
be measured. The docked strip stays visible while a section is mounted rather
than following editor focus, because blur on touch arrives through pointer
events that cannot be suppressed the way `mousedown` can.

### `ColorModeToggle` sits in the surface's corner

It is `position: fixed` at `zIndex.modal + 1` so it stays usable over any
dialog — and its tooltip floats there too. `FocusSurface`'s header therefore
carries `pr: 6` to move its own overflow button clear; without it the tooltip
swallows the clicks.

### `ProseFaceContext`

The manuscript typeface (serif by default, from `brandFontFamily`) is the one
typography setting, kept in `localStorage` following `ColorModeContext` — it is
a property of this browser, not of a tome. The measure is **not** settable:
`proseMeasure` is a fixed `66ch`, and because `ch` is font-relative it stays ~66
*characters* when the face changes. It is a `max-width`, so a phone is bound by
its own width (~37 characters) and never overflows.

## The Write editor autosaves — it deliberately has no Save button

`../pages/WriteEditorPage.tsx` is the one screen that does **not** follow the
app's "stage edits, commit on Save" convention. Title, type, and the Lexical
document are written on a debounce, and there is no Cancel. Two consequences
worth knowing before editing it:

- **A draft row is created at the click site** (the Write list's "New" menu,
  or `PlotItemDialog`'s "New text"), never by a `write/new` route that creates
  on mount. Under `StrictMode` a create-on-mount effect fires twice and would
  leave an orphan draft on every click.
- **`store.discardWriteItemIfBlank` runs on unmount, deferred one tick.**
  StrictMode's dev-only remount runs the cleanup on a page that is about to
  come straight back; discarding there would delete the draft the author is
  looking at. The `alive` ref is re-set by the re-run effect before the
  deferred callback fires, so only a real unmount discards. Don't "simplify"
  that timeout away.

### `SaveStatus` is what the author sees of all that

Because there is no Save button, `SaveStatus.tsx` is the only thing that ever
says a write happened: a caption in the header spacer reading "Saved" in
`text.secondary` at rest, "Editing…" / "Saving…" as the state moves, and green
for a moment on each success.

**None of the timing is here, and none of it is in the page either.** It lives
in `../hooks/autosave.ts`, which holds no React and no DOM so its rules can be
tested under fake timers in the suite's `node` environment — see the root
`AGENTS.md`. `useAutosave` binds that machine to React state; `SaveStatus` is
stateless and renders whatever state it is handed, so the words cannot disagree
with what was written. Change a timing rule there, not here, and expect
`hooks/__tests__/autosave.test.ts` to have an opinion.

Three things the page and the component still own:

- **`handleChange` compares the serialized document before scheduling.**
  Lexical routes selection-only updates through the same callback and fires
  once on mount; both used to schedule a write. Without the comparison the
  indicator announces a save every time the caret moves and a freshly opened
  chapter opens on "Editing…".
- **The page's `alive` ref is only about the discard again.** `useAutosave`
  keeps its own for state, so the unmount flush cannot `setState` on a dead
  component without the page having to think about it.
- **The indicator sits *after* the header's `flex: 1` spacer.** The spacer, not
  the type picker, then absorbs the width change as the words switch, so
  nothing to its right moves. Measured: the picker holds one x through the
  whole cycle.

## The editor toolbar is described by a config, not hand-wired JSX

`../lexical/ToolbarPlugin.tsx` renders from `ToolbarItem[][]` — an array of
groups, dividers between them — defaulting to the exported
`defaultToolbarItems`. Add, drop, or regroup controls by changing that array
or passing an `items` prop; don't hand-place buttons in the JSX.

Its one non-obvious rule: **every button suppresses `mousedown`**. Focus would
otherwise leave the editor the instant a button is pressed, Lexical's
selection would collapse, and the command would apply to nothing. `ToolButton`
does this centrally, which is why toolbar controls go through it rather than
using `ToggleButton` directly.

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
  — match this instead of inventing new breakpoints. The single deliberate
  exception is the two-column layout in `../pages/PlotComparePage.tsx`, which
  stacks until `md` (900px): two timelines each carry a track, labels, and
  cards, and do not fit beside each other at 600px.
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
  regardless of where you clicked "Edit" from. In create mode it also carries
  both template pickers (see above); in edit mode it carries neither, because a
  template is only ever applied at creation.
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
  `../pages/PlotPage.tsx`: the label column, the track with its dot and insert
  affordances, and a `PlotBeatCard` for the beat. It **returns a MUI
  `TimelineItem` as its own root** rather than wrapping one: `Timeline` hands its
  `position` down through React context, so an intervening element breaks the
  row's layout grid. The `@dnd-kit` sortable ref and transform therefore land on
  that `TimelineItem`, and the handle's wiring is passed down to the card.
- `PlotBeatCard.tsx` — the beat itself: title, description, attached-element
  chips, and the drag handle. Split out of `TimelineCard` so the same card can
  sit in a MUI `TimelineContent` or in a grid cell, since a beat is drawn in both
  the single-plot timeline and the aligned compare grid. **It does not call
  `useSortable`** — whichever container registered the beat owns the node ref and
  the transform and passes `dragHandle` down, because in a grid the draggable
  node is the cell rather than the card. `labelMode` decides where `item.name` is
  drawn: `"compact"` only below `sm`, where the timeline's own label column
  disappears, and `"always"` for a layout with no such column. The drag handle is
  a plain `Box component="button"`, **not** an `IconButton` — ButtonBase routes
  key events through its own `getButtonProps` wrapper, which swallows the
  `onKeyDown` that dnd-kit's `KeyboardSensor` needs to start a lift. The hover
  reveal for that handle lives on the card's own `sx`, so it travels with the
  card into whatever layout holds it.
- `PlotTimeline.tsx` — one plot drawn as a sortable timeline: the `@dnd-kit`
  context, the locally-held render order, the `TimelineCard` list, and the
  empty state. Pages hand it a plot's items and callbacks and get a whole
  timeline back. It owns the drag context **per instance** on purpose, so
  `../pages/PlotComparePage.tsx` can mount two of them side by side without a
  card from one plot being droppable into the other. `../pages/PlotPage.tsx`
  mounts a single one.
- `PlotGrid.tsx` — two or more plots drawn against the tome's shared row axis, so
  beats sharing a row line up and a plot with nothing on a row shows a gap. The
  alignment is CSS, not arithmetic: every row's cells are siblings of one
  `display: grid`, so the grid row grows to its tallest card and the rest stretch
  beside it. Consequences worth knowing before editing it:
  - **One `DndContext` for the whole grid**, unlike the per-instance contexts
    `PlotTimeline` uses. A column's cells are interleaved with every other
    column's in DOM order, so a provider cannot wrap one column. `sameColumnOnly`
    filters the droppable candidates by `plotId` instead, which also stops the
    grid highlighting a cell that would refuse the beat.
  - **Collisions resolve by overlap (`rectIntersection`), not `closestCenter`.**
    Rows differ enormously in height — one long beat makes a row several times
    its neighbour — and `closestCenter` scores a card sitting squarely inside a
    tall row as *further* from it than from the short row it just left, so the
    drop silently does nothing. `closestCenter` remains the fallback for when the
    card is in a gap between rows and overlaps nothing.
  - **`cellKeyboardCoordinates` aligns top edges deliberately.** dnd-kit's
    `KeyboardSensor` scrolls the page instead of moving the card whenever the
    requested position falls past the scrollport's vertical midpoint, so aiming
    at a tall row's centre turns every keypress into a scroll that never arrives.
    Short steps keep the move a move.
  - The row gutter is `position: sticky; left: 0` with an opaque background, so
    labels hold while the columns scroll horizontally past them.
- `TimelineConnectorInsert.tsx` — a `TimelineConnector` that doubles as an
  insert point, revealing a "+" on hover/focus. The gap between two cards is
  two stacked connectors (the upper card's bottom, the lower card's top); both
  are handed the same insert index, so the whole gap acts as one target.
- `PlotItemDialog.tsx` — route-driven create/edit dialog for a `PlotItem`,
  including the multi-`Autocomplete` attachment picker. Attachments are plain
  associations to elements with no label — that is the whole difference from a
  `Relationship`, so do not grow a description field here.
- `PlotPicker.tsx` — tabs for switching between a tome's plots, plus
  create/rename/delete. Its "New plot" dialog carries the plot-template picker.
  The dialog's fields are uncontrolled, so it resets the form on open: MUI keeps
  a dialog's children mounted until the close transition ends, and without the
  reset a cancelled rename followed straight by "New plot" reopens carrying the
  old plot's name.
- `PlotTemplatePicker.tsx` — the story-structure select shared by
  `TomeFormDialog` and `PlotPicker`, with a preview of the beat count and beat
  labels the chosen structure will write. Controlled: the parent owns the id.
- `WriteItemCard.tsx` — the small, title-only card in the Write grid. It owns
  its own 250ms hover timer and `Popover` sample rather than letting the page
  track which of n cards is hovered. The `Popover` is
  `pointerEvents: "none"` so it never becomes the mouse target and bounces
  `mouseleave` off the card beneath it.
- `WriteItemTypeIcon.tsx` — glyph for a `WriteItemType`. Unlike
  `ElementTypeIcon` there is no registry or fallback: the four types are a
  closed union, so the mapping is total.
- `SaveStatus.tsx` — the Write editor's autosave indicator. Stateless; see the
  autosave section above for the rules that keep it honest.
- `EmptyState.tsx` — shared "nothing here yet" placeholder.
- `ColorModeToggle.tsx` — fixed-position light/dark toggle, rendered once in
  `App.tsx` so it's available on every route.
