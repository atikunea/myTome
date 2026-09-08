# src/components

Shared UI building blocks for myTome (React 19 + TypeScript + MUI, function
components with hooks — no class components, no web components). This
folder holds pieces reused across routes (`SideNav`, `AppHeader`,
`TomeFormDialog`, `FieldDefinitionsEditor`, `CoverThumbnail`, `ImagePicker`,
`EmptyState`, `ColorModeToggle`, `PlotGrid`, `BeatDot`,
`PlotBeatCard`, `RemoveEmptyRowsButton`, `PlotItemDialog`, `PlotPicker`,
`WriteItemRow`, `WriteItemTypeIcon`, `RestoreDialog`, `DriveSyncCard`,
`PolicyProse`, `ProseField`, `InlineTextField`, `RelationshipRowEditor`).
Lexical editor internals (custom nodes and plugins) live in `../lexical`
rather than here — they are not MUI components. The Write editor is no longer
their only caller: `ProseField` mounts `CaretAtPointPlugin` and
`ProseToolbarPlugin` on the element page too. Route-level screens live in `../pages`
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

## Object URLs: hold the Blob, derive the URL

`URL.createObjectURL` hands back a handle with a lifetime, and its caller owns
the matching revoke. A component that *stores* that handle inherits the
bookkeeping — revoke before overwriting, revoke on close, revoke on unmount —
and every path that sets it becomes a path that can leak. Calling it in a
render body is the worst case: one URL per render, each pinning the Blob for
the life of the document. This went wrong twice (the dashboard cover and
`ImagePicker`'s tile) before it was made structural.

**`hooks/useObjectUrl.ts` is the only place in render-land that allocates
one.** `useObjectUrl(blob)` keys a `useLayoutEffect` on the Blob and revokes on
unmount and on change; `useImageSrc(image)` is one line on top of it resolving
the `ImageSource` union. So components hold **Blobs and `File`s — inert values
— and let the hook derive the URL.** `ImagePickerDialog` is the worked example:
storing the picked `File` instead of a URL made from it deleted a ref, a
revoke-before-overwrite helper, and both manual revokes, and turned "which
preview wins" into an ordinary `??` chain.

Two boundaries worth keeping:

- **It is a *layout* effect.** With `useEffect` the URL lands after the first
  paint, so a caller with a fallback paints the fallback and flashes the real
  content in behind it.
- **It is for a URL that lives as long as a rendered element.** A URL that
  lives as long as one *action* — the `Blob` + `<a download>` dance in
  `../pages/BackupPage.tsx` and `ManuscriptExportDialog.tsx` — belongs in the
  handler that creates it, where create/click/revoke already sit together.
  Don't convert those.

`services/images.ts` was narrowed to match: `imageHref` returns the address of
an image that already has one (`kind: "url"`) and **allocates nothing**, so it
is safe anywhere, render bodies included. It replaced an `imageUrl` that
silently minted an object URL for the blob case — the read that looked free and
was not. Adding a second caller of `createObjectURL` outside the hook puts that
trap back.

## Naming: `Plot` is the record, and nothing here is a `Timeline` any more

The plotting feature's domain records are `Plot` and `PlotItem` (`models/Plot.ts`,
the `plots`/`plotItems` tables, `store.savePlotItem`, the `/plots/:plotId`
routes). They are deliberately **not** named `Timeline`/`TimelineItem`, because
`@mui/lab` exports components by those names and the collision would force an
import alias in every file that touched both. Keep it that way: no file should
need to alias `@mui/lab`'s `TimelineItem`.

**`@mui/lab`'s Timeline is no longer used at all.** `PlotTimeline`,
`TimelineCard` and `TimelineConnectorInsert` are gone; `PlotGrid` draws every
plot, and its `Track` reproduces the line and dot by hand. That was forced
rather than chosen: `Timeline` distributes `position` through React context and
lays a row out as its own flex container, so it cannot span the columns of a
grid — and the grid is what makes beats on the same row line up. `BeatDot` is
the stand-in for `TimelineDot` for the same reason.

## One plot and several are the same screen

There is **one plotting page**, `../pages/PlotPage.tsx`, and it draws a list of
one or more plots as columns of one `PlotGrid`. There used to be two pages, two
layouts and a mode you entered with "Compare" and left with "Exit compare"; an
author moving between them had to re-learn the screen. The pieces that made the
merge possible, each worth defending:

- **The gutter is the spine row.** It used to be the *beat label*
  (`PlotItem.name`) on the single-plot page and the *row label* (`PlotRow.label`)
  on compare — two unrelated records taking turns in one slot, which is how the
  spine stayed invisible to anyone who never opened the compare view. The beat
  label now lives on the card, always.
- **A gap is drawn whatever the column count.** The single-plot view used to pack
  beats contiguously, so a plot with a hole in it looked identical to one without.
- **Row actions belong to the grid, not the page.** Inserting a row, deleting one
  and naming one are the same act however many columns are drawn, so `PlotGrid`
  owns all three and calls the store itself. The page is left with one prop for
  them — `onSaveState`, because a label's autosave needs somewhere on the page to
  report.
- **Both labels are typed where they are read.** A row's, in the gutter, and a
  beat's, on the card — each an `InlineTextField`, the same as a tome's title or
  an element's fields. An unnamed row shows its position as the *placeholder*, so
  a name the author chose looks different from the one the spine fell back to.
  The `rows/:rowId` route that opened the old dialog is kept only as a landing
  for `compare/…/rows/:rowId` and replaces itself with the plot's address — which
  field is being edited is not in the URL, the same call `ElementPage` and
  `ProseManuscript` make.

  Neither label has a form field left anywhere. `PlotRowDialog` went entirely;
  `PlotItemDialog` survives as the beat's full editor but lost its Beat label
  row, because two fields writing one value is how they drift. It still has to
  **carry** `item.name` through a save, though — `savePlotItem` takes `name` as
  required and writes what it is given, so omitting it or passing `""` would
  clear the label every time anything else about the beat was saved. Same hazard
  as `icon` and the dot: that function has no fallback to the stored row.
- **One `onSaveState` serves every field on the screen**, gutters and cards
  alike, and `PlotPage` renders one `SaveStatus` from it. It must be stable:
  `InlineTextField` re-fires its report whenever that identity changes, and with
  a fresh one every render the last field to speak would overwrite the state of
  the one actually being edited.
- **The tabs are the only control over which plots are drawn.** Clicking a tab
  shows that plot alone; the toggle inside each tab adds or removes it as a
  further column. That replaced a "Compare" menu, an "Add plot" menu, an "Exit
  compare" button and a per-column `<TextField select>` — four controls for one
  question, none of them in the same place.
- **`renderColumnHeader` is optional**, and the page passes none for a single
  column: the tab strip sits directly above the grid and already names it. With
  several, a header is the only thing saying which column is which — and it is
  just a name and an add-beat button, because *which* plots are drawn is the tab
  strip's business, not the header's.

**The columns are drawn in the tabs' order, and the URL's order is a different
thing.** `PlotPage` derives two lists from `:plotIds` and they must not be
conflated:

- `selected` is the URL's own order, and its **first id is the primary plot** —
  the tab the strip marks selected, and what rename, delete, "Add item" and the
  manuscript export act on. Toggling a plot on *appends* to this.
- `columns` is the same plots sorted by `Plot.sortOrder` (the order
  `observePlots` returns, which is the tab order), and is what is drawn.

Sorting the URL itself would be simpler and is wrong: the primary would become
whichever plot happens to sort first, so switching on a plot that sits earlier in
the strip would silently re-aim the export — and the delete — at a plot the
author never selected. Keeping the primary at the head of the URL is what stops
that, and it is why toggling appends rather than inserting.

Reordering the columns is therefore **only** a tab drag. Don't add a second
gesture for it: the tab drag already writes `Plot.sortOrder`, and a column drag
would be a second way to say the same thing that also has to fight the beat drag
already living in those cells.

Two smaller asymmetries are also deliberate. Rename, delete, "Add item" and the
export are singular by nature — most of all the export, since a manuscript is one
plot line. And **`aria-pressed` on the tab's toggle carries the real column
state**, since MUI's `Tabs` has one `value` and cannot say that three tabs are
on: the tab itself means "go to this plot alone", the toggle means "in or out of
the set".

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

**Text is added to a beat from one menu, opened from two places.** Its rows are
the four kinds — which start a new section — then "Existing text…", which opens
`WriteItemPicker` to compose in something already written. The two openers:

- The "Add text to this beat" button under the manuscript. It appends.
- A `+` in the gutter above each section, revealed on hover or focus — the same
  trick `PlotGrid`'s `RowInsert` plays between two rows. It adds *there*,
  which is the only way to put text part-way up a beat without walking it there
  through "Move earlier".

`BeatManuscriptPage` therefore holds the menu's anchor and its position
together (`{ anchor, at }`, `at` undefined meaning the end), and
`ProseManuscript`'s `onInsertAt` hands back the index *and* the button to hang
the menu on rather than acting itself — what can be added is the page's
business, the same way `sectionMenu` is. Keep the two openers offering the same
rows: a `+` that could only do half of what the button does is a worse control
than no `+` at all.

A position is a place in the beat's **reading order**, and both actions carry it
the same way: `createDraftWriteItem`'s `at` splices the new row in inside the
create's own transaction (never create-then-reorder, which would show the new
section at the bottom for a frame), and the picker's route carries the index so
a refresh reopens it in place. The index counts *resolved sections*, since that
is what the author clicked between, so the page maps it back through the anchor
section's id — a stored id that resolves to nothing must not silently shift
where the text lands.

The strip that draws that `+` is **zero height**, and has to stay that way. Its
band is painted inside the margin the next section already carries (`mt: 5`),
below the previous section's static block — whose padding overhangs its own
bottom edge by 12px to widen the click-to-edit target, hence the `top: 12`
offset. The first section has no such margin, so `ProseManuscript` adds `pt` to
its container when (and only when) insert points are offered; that padding is
unconditional within a beat, so it never moves prose in response to a click.
Laying the strip out for real would break the premise the whole surface rests
on: the caret lands on the right word only while the static and mounted renders
occupy identical space.

The picker itself keeps two rules. It **shows texts already used elsewhere**,
with an "in 2 beats" hint, because composing one `WriteItem` into several beats
is the model working as designed — only the beat's own text is excluded, since
`setPlotItemWriteItems` dedupes and offering it would be a control that does
nothing. And picks land **in the order they were picked**, so pulling three
snippets in reading order does not then need three trips through "Move earlier".

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

Six things here will bite if you change them:

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
- **The section title is a label on the rule, not a heading.** On a beat
  (`sectioned`) it sits inline with the kind label and the divider, small and in
  the UI face; given its own line at prose size in the prose face it reads as
  text to be read, and the eye stops on it between every part of what is meant
  to be one continuous manuscript. `WriteEditorPage` (`sectioned={false}`) keeps
  it as the document heading — one text, no flow to interrupt, and the only
  place its underline still marks it as a field. Either way the
  header's height must **not** depend on `active`: it sits above the prose in
  the same section, so a header that grows on click moves the very text the
  caret is being resolved against. Measured 30px in both states.
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

**The pill carries the block controls too** — the block picker, which is where
Quote lives, plus lists and alignment. They therefore only ever act on a
selection, because a selection is the only thing that brings the pill into
existence: to turn a paragraph into a quote or a bullet the author selects a
word in it first. That was chosen over anchoring the pill to a collapsed caret,
which would float a control beside the text on every click and undo the point of
a surface whose chrome recedes as you write. The pill is consequently wide
enough to outgrow a narrow window, so its `Paper` caps its width and scrolls
horizontally the way the docked strip does — wrapping would put a second row
over the selection.

**The pill is the parent of every control it opens, so it must not vanish while
one is open.** `SelectionToolbar` returns `null` the moment its rect goes, which
unmounts `ToolbarPlugin` and takes the link popover — and any open menu — with
it. Its `sync` therefore returns early, holding the last rect, whenever the
document selection's `anchorNode` is outside the editor root: focus has moved
into the pill's own chrome, where `getSelection` describes the link field rather
than the manuscript. Without that guard **pasting a URL into "Insert link" just
closed the tool**: a URL longer than the field scrolls it horizontally to follow
the caret, and the `scroll` listener is capturing on `document` (the surface
scrolls its own container, not the window), so an input's own scroll arrived
here as "the page moved" and dropped the rect. Typing worked because a short URL
never overflows. `resize` was the same trip wire, one window-drag away. This is
the class of bug the `node` suite cannot see — verify it by driving the app, and
a `scroll` event dispatched on the focused field reproduces it without a
clipboard.

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

## The Write list is a table, and it is the app's only one

`WriteListPage` was a grid of cards and is now an MUI `Table` — the first and
so far only table in the repo, so what it settled is the pattern for the next
one:

- **The row opens the item, and the title is a real button as well.** A `<tr>`
  with an `onClick` is unreachable from the keyboard, and giving the row a
  button role would cost the table its semantics; so the mouse gets the whole
  row and the keyboard gets the title, which is also the accessible name. The
  title's handler calls `stopPropagation` — without it a click there runs both
  and navigates twice.
- **Every header sorts, so there is no sort control.** The old
  "Recently updated / Story order / Alphabetical" `<select>` is gone: those are
  three of the five columns, and `services/storyOrder.ts` owns which way each
  one opens. Note that "Used in" *is* story order — see the root AGENTS.md.
- **"Used in" and "Words" fold away below `sm`; "Updated" does not.** At that
  width `SideNav` is already a horizontal strip and five columns cannot fit, but
  which text was touched last is the question a phone gets asked. The cells lose
  ~6px of MUI's 16px padding there too, without which the table grows a
  horizontal scrollbar of its own inside a body that fits.
- **The delete button is revealed on hover — except below `sm`, where it
  stays.** A column of delete buttons is an invitation on a desktop; a phone has
  no hover to reveal one with, and an action reachable only by hovering is no
  action at all. It is `opacity`, not `display`, so `:focus-visible` can bring
  it back for the keyboard.

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

## The element page edits in place, and reuses the focus surface's machinery

`../pages/ElementPage.tsx` is the **second** screen with no Save button, and the
first one that is not prose end to end. An element is a page you read — name,
description, its type's custom fields, relationships, image — and every field is
edited where it sits. `ElementListPage` is now only a list; there is no element
form left anywhere.

It is built out of pieces the writing surface already proved, and the borrowings
are the load-bearing part:

- **`ProseField` is `ProseManuscript`'s swap applied to a field.** Static
  `StaticProse` until clicked, then one mounted editor with the caret at the
  click point, and the same three-step handover — the outgoing editor's unmount
  flushes its own pending write, the field is redrawn from the page's `edits`
  rather than from the row, and the incoming one mounts keyed by field. Its
  wrapper's padding, margins and gutter are **identical in both states** for the
  reason set out under the focus surface: the click point is hit-tested against
  the editor's DOM after the swap. Verified in the browser — a description
  measured `{x:288, y:162, w:658, h:67}` in both states, and a click on the
  eleventh word put the caret at offset 46 of 79, inside that word.
- **That constraint is why a description does not look like a `TextField`.** A
  bordered control at rest and an editor when active cannot occupy the same
  space, and the caret would land at the start of the block. It reads as prose
  on this page because it has to, and the active mark is a gutter `::before`
  rather than a border for the same reason.
- **`CaretAtPointPlugin` moved to `../lexical/`** when this page needed it. Its
  three traps are written up under "Focus must never depend on an animation
  frame" and are now shared rather than duplicated.
- **`ProseToolbarPlugin` comes along unchanged**, so a selection raises the same
  floating pill here as in a chapter, and a touch device gets the same docked
  strip. There is no standing toolbar on this page.
- **No `MentionsPlugin`.** Mentions are prose-to-element links that are
  deliberately not cascade-maintained, and `Relationship` already does that job
  properly on this very page.

Four rules the page itself holds:

- **One prose field is live at a time.** Each mounted editor owns an autosave
  machine, so two live fields would be two machines writing one row with
  `SaveStatus` reporting whichever spoke last.
- **A click that reaches the page clears the active field**; `ProseField` stops
  its own clicks so the caret can still be moved inside the field being edited,
  and `InlineTextField` calls the same thing on focus for the keyboard. Without
  this the gutter accent claims an edit is in progress after the author has
  moved on.
- **Writes are patches.** `store.updateElement` re-reads the row inside its
  transaction, so a field saved while a live query's echo is still in flight
  cannot revert the field saved a moment before it. Never assemble a whole
  element from what the page last observed.
- **The unmount sweep is `WriteEditorPage`'s, verbatim** — deferred a tick past
  StrictMode's remount, and awaiting the editor's flush first. Confirmed in the
  browser: a draft typed into and immediately left survives; an untouched one is
  gone.

### `InlineTextField` does *not* swap, and that is deliberate

A one-line value has no caret to resolve against a click, so the swap would buy
nothing and cost the thing that makes it safe — two renders occupying identical
space. The input is always live and simply looks like text until hovered or
focused, which is also one fewer click to the word the author came to change. It
autosaves on the shared debounce and **flushes on blur**, so a pending write
lands as focus leaves rather than trailing the author to the next field.

`select` fields are a plain MUI select, saving on change: a select at rest
already looks like a value with a caret beside it, and there is nothing to swap.

### A `prose` field can hold `""`, and Lexical throws on that

`FieldKind` now includes `prose`, and its value lives in `Element.attributes`
like any other — a serialized document is a string. A field nobody has written
in has **no entry at all**, so the value read out is `""`, and
`JSON.parse("")` throws before any editor exists to catch it. `ProseField`
normalizes with `asProseDocument` at its boundary, which also rescues a field
whose kind was changed from `text` and therefore holds a line of plain text. Do
the same anywhere else a stored value reaches an editor. The rest of the
prose-kind rules — emptiness, search, cards — are in the root `AGENTS.md`.

### The tome overview is the same page, one table over

`../pages/TomeDashboardPage.tsx` is the **third** screen with no Save button,
and it is deliberately the element page with different fields: `InlineTextField`
for title and subtitle, a plain select for status, `ImagePicker` for the cover,
one `ProseField` for the description, `SaveStatus` and a delete `IconButton` in
its header. Every rule above holds here unchanged — the click that reaches the
page stands the prose field down, the field redraws from the page's pending edit
rather than from the row, and `store.updateTome` is a patch re-read inside its
transaction. Read that section, not this one, for *why*.

Three things are its own:

- **It has no unmount sweep**, and needs none. `WriteEditorPage` and
  `ElementPage` sweep because their rows are created blank at a click site; a
  tome is only ever created deliberately, from `/tomes/new`, with a title.
- **The delete button lives here and nowhere else.** The library card is a
  `CardActionArea` and nothing more — no Open, no Edit, no Delete — so the one
  place a book can be destroyed from is the page showing what would go with it.
  It still goes through `useConfirm()`, naming the tome.
- **The cover is a picker, not a thumbnail**, and it is the reason `ImagePicker`
  forwards `imageSx`: this is the one place a cover is shown whole rather than
  cropped to its tile.

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
  — match this instead of inventing new breakpoints. `PlotGrid` uses `sm` too,
  for its gutter and column floor; it does **not** stack its columns at any
  width, because columns that stack are not aligned and alignment is the whole
  point. Too many columns for the screen scroll sideways inside the grid's own
  scrollport, never the body.
- No hand-written inline `<svg>` icons — use `@mui/icons-material`.

## Below `sm` the nav is a top bar, and its height is pinned deliberately

`SideNav` turns into a horizontal strip under `sm`, and three things keep that
strip one consistent, minimal height. Each fixes a way it grew before:

- **`WorkspaceLayout`'s grid sets `gridTemplateRows`.** Its rows were implicitly
  `auto`, and `align-content` on a grid defaults to stretch, so with
  `minHeight: 100vh` the nav row absorbed whatever vertical space the page did
  not use — 282px on a dashboard, and a different number on every route. The
  rows are now `"auto 1fr"` at `xs` (bar to its content, leftover to `main`) and
  `"1fr"` at `sm`, which is what keeps the dark sidebar running the full page
  height in the two-column layout. If you touch that grid, keep both.
- **`NAV_BAR_HEIGHT` is a fixed `height` at `xs`, not a `minHeight`.** A tome
  with six plots and one with none must occupy the same strip, and a nav item is
  a fixed 40px there (`navItemSx` drops `py` to `0.5` below `sm`).
- **`overflowX: auto` with `overflowY: hidden`, and a thin scrollbar.** The
  strip's `scrollWidth` runs past 2000px on a tome with several plots; only the
  horizontal axis may scroll, and a classic scrollbar tall enough to eat the
  bar's padding would reintroduce the varying height it was overlay-thin
  elsewhere.

Verified by driving the app at 375px across routes of different lengths and with
a tome carrying fourteen nav items — the kind of layout the `node` suite cannot
reach.

## The restore dialog is the one dialog that is not a route

Every create/edit dialog in this app is mounted by a `<Route>` (see the root
AGENTS.md). `RestoreDialog.tsx` is the exception, held in plain `useState` by
`../pages/BackupPage.tsx`, and the reason is the test to apply to any future
dialog: its state is a `File` the author picked out of their filesystem, and no
URL can rebuild that. A route would only ever reopen an empty dialog.

Two things about it worth keeping:

- **It shows what a restore would do before doing it** — per tome, whether the
  file is new here, newer than the copy here, or holds nothing newer — because
  the author cannot otherwise tell that the file they grabbed is the stale one.
  That verdict comes from `store.summarizeBackup`; the dialog computes none of
  it itself.
- **"Replace everything" still goes through `confirmAction`**, so the app-wide
  confirm stacks on top of the restore dialog (mounted later, so it paints
  above — verified in the browser, not assumed). Its button reads "Delete
  permanently", which is the ConfirmProvider's fixed wording and accurate
  enough: replacing does delete every tome here. Don't fork the provider to
  reword it.

`BackupPage` is deliberately the only place that touches the DOM for this: the
`Blob` + `<a download>` dance and the hidden file input live there, and
`services/backup.ts` stays a pure data layer that the tests can drive under
`node`. When Google Drive lands it belongs beside them under "Where backups go"
as another transport for the same file — not as a second format.

## `PolicyProse` is shared so the two policy pages cannot drift

`PolicyProse.tsx` holds the chrome (`PolicyPage`) and the prose primitives
(`PolicySection`, `PolicyParagraph`, `PolicyBullets`) that the two policy pages
in `../pages` — `PrivacyPolicyPage.tsx` and `TermsOfUsePage.tsx` — render
through.

It exists for one reason, and it is not deduplication: **the two pages are read
as a pair**, each links to the other, and a reader who finds them styled
differently reasonably concludes one of them is stale. Sharing the chrome makes
that impossible.

It is also the whole extent of the idea. Every other screen in this app is a
view of the database; these two are a document, and `PolicyPage` hardcodes what
a document needs — back to the library, a title, a lede, a "Last updated" line,
a sibling link. Don't grow it into a general page scaffold for pages that have
none of those.

## The library page teaches once, then steps aside

The front page carries the app's only documentation, and four components in
here render it: `LibraryGuide` (the whole guide), `SpineDiagram` (its one
picture), `GuideStrip` (the line it shrinks to), and `FeatureHighlights` (the
band under a full shelf). `../pages/TomeLibraryPage.tsx` chooses between them.

- **An empty shelf is the only screen with nothing to lose**, so it is given
  over entirely to `LibraryGuide`. Once there are tomes the shelf comes first
  and the guide is one dismissible strip — a returning author should not scroll
  past a pitch to reach their books.
- **The branch is on an empty *library*, not an empty *result*.** A search
  matching nothing still gets `EmptyState`: those tomes exist and the author
  simply cannot see them, so replacing the shelf with a beginner's walkthrough
  would be a lie about their library.
- **Dismissal is not deletion.** `GuideStrip`'s ✕ writes
  `mytome:guide-dismissed` to `localStorage` and the guide keeps its address at
  `/tomes/guide`, linked from the library footer. Any UI that hides something
  permanently owes the author a way back to it. That key is also a claim the
  privacy page makes — see the root AGENTS.md.
- **`LibraryGuide` is numbered and `FeatureHighlights` is not**, and that is
  content rather than styling: the five steps are the order the app actually
  requires (a tome before elements, elements before the beats that attach them,
  beats before the prose that sits on them), while the three highlights are
  unordered capabilities. Don't number a list that isn't a sequence.
- **`SpineDiagram` teaches the row axis by drawing it**, because "beats on the
  same row are contemporaneous" means nothing to a reader who has not yet seen
  a gap. It is an illustration with sample beats — it reads no table, and it
  tracks `PlotGrid` by hand, which is the right trade for a picture that has to
  survive being a third of the size.
- **The guide says what an author gets, never what the code holds.** No
  "element type", no "plot row", no "spine" — a reader who has not opened a tome
  has no referent for any of them. The app teaches its own vocabulary in place.

## Current components

- `SideNav.tsx` — per-tome left nav; lists the tome's ElementTypes. Reads
  `useTomeWorkspace()`. Below `sm` it is a **top bar of fixed height**
  (`NAV_BAR_HEIGHT`), scrolling only sideways — see below.
- `ProseField.tsx` — one click-to-edit block of prose: the description, and
  every `prose` custom field. The swap, the caret and the pill; see above.
- `InlineTextField.tsx` — a line of text edited where it sits. Always live, no
  swap, flushes on blur; see above.
- `RelationshipRowEditor.tsx` — one relationship as the sentence it reads as.
  Was local to the old element form and moved out with it; `ElementPage` saves
  a row as soon as it has both a target and a label.
- `RestoreDialog.tsx` — the summary + merge/replace choice for a chosen backup
  file; used only by `../pages/BackupPage.tsx`. See above.
- `PolicyProse.tsx` — chrome and prose primitives for the privacy and terms
  pages. See above.
- `LibraryGuide.tsx` — the five-step guide: the whole of the library page when
  the shelf is empty, and the whole of `/tomes/guide` after. Takes `firstTome`
  only so its button can say "Make your first tome" honestly. See above.
- `SpineDiagram.tsx` — the drawing of three plots against one row axis, inside
  `LibraryGuide`. Sample beats, no table read. See above.
- `GuideStrip.tsx` — the one line the guide shrinks to once tomes exist. Owns
  its own visibility and its `localStorage` dismissal. See above.
- `FeatureHighlights.tsx` — the three-up band under a full shelf: compare,
  backup, export. Deliberately unordered and unnumbered. See above.
- `ManuscriptExportDialog.tsx` — turns one plot line into a `.docx` or a PDF,
  mounted by `plots/:plotId/export`. It owns only the two choices (which
  `WriteItemType`s, and whether beats open with their label) and the two
  transports; `services/manuscript.ts` decides what the document *contains* and
  is recomputed on every toggle, so the counts under the switches are the counts
  of the file about to be written. Everything left out — filtered texts, beats
  with nothing in them — is reported there rather than dropped quietly, and a
  text composed into several beats is **named** under "Appears more than once"
  with each beat it lands in. That list is not an omission: the text is printed
  in every one of them. Don't turn it back into a count — the name is the whole
  point, because it is what lets the author go and check whether the repeat was
  deliberate.
- `ManuscriptPrint.tsx` — the same manuscript as paper, and the entire PDF
  path: there is no PDF library in this app. It renders through `StaticProse`
  and `manuscriptSx`, portals to `<body>`, and a `@media print` block blanks
  every other body child. **`inkSx` restates every theme colour in black**
  because `manuscriptSx` is written in tokens and would otherwise print
  near-white text when the app is in dark mode — verified by printing in dark
  mode, not assumed. Mounted only while printing, via `flushSync` before
  `window.print()` (an effect would fire twice under `StrictMode`) and removed
  on `afterprint`. See the root AGENTS.md for the rest.
- `DriveSyncCard.tsx` — the "Where backups go" card, including Google Drive
  connect/sync. **Its first state is "not set up":** without a
  `VITE_GOOGLE_CLIENT_ID` compiled in, `driveConfigured` is false and the card
  is prose with nothing to click — no dead buttons, and a fork of this repo
  never quietly talks to someone else's Google project. Keep that shape for any
  future integration. Sync is a button, never a background loop (see the root
  AGENTS.md for why), and connection state is `useState` seeded from
  `isConnected()` because the token is deliberately memory-only — a reload
  starts disconnected, and that is correct rather than a bug to paper over.
- `AppHeader.tsx` — per-tome workspace header (title + back link + edit
  link). Reads `useTomeWorkspace()`.
- `TomeFormDialog.tsx` — **create-only** dialog for a Tome, used by
  `TomeLibraryPage` at `/tomes/new` and nowhere else. It had an edit mode, and
  `/tomes/:id/edit` mounted it over the dashboard; both are gone — editing a
  tome happens on `../pages/TomeDashboardPage.tsx` where the fields are (see
  above). What is left here is the part a page cannot do, because it happens
  before the tome exists: the two template pickers. Its Description box is
  still plain text, wrapped into a document by `saveTome` — a first line about
  the book is worth asking for while the author is here, and the writing of it
  happens in the editor on the overview.
- `FieldDefinitionsEditor.tsx` — add/edit/remove/**reorder** UI for an
  ElementType's custom field definitions (`FieldDefinition[]`); used by
  `../pages/ElementTypesPage.tsx`. Reordering is the cheapest kind of drag in
  this codebase, because **field order is the array's order and nothing else**:
  `saveType` renumbers every `sortOrder` from the index it is handed, so a drag
  is one `arrayMove` on the parent's `useState` draft and needs no store call,
  no locally-held render order, and no stale-drag guard — unlike `PlotGrid`,
  whose order is live-queried and written on drop. Nothing reaches the database
  until "Save type", which is what the rest of this form already does.
  Two details worth keeping:
  - **The handle is grouped with the name field, not placed in the outer row.**
    That row is `direction={{ xs: "column", sm: "row" }}`, so a handle among its
    direct children lands on a line of its own at `xs` and reads as a stray
    icon. An inner row of handle + name holds them together at both widths.
  - **`type="button"` on the handle is load-bearing here** in a way it is not on
    `PlotBeatCard`'s: this one sits inside the element type's `<form>`, and a
    bare `<button>` defaults to submit, so every Enter pressed while it held
    focus would save the type.
- `CoverThumbnail.tsx` — shared cover image / fallback-letter-avatar, used by
  Tome and Element cards, the tome dashboard, and `ImagePicker`'s own tile.
  Its no-image fallback is why nothing in the app needs a placeholder image
  asset: reach for this component rather than an `<img>` with a `/images/…`
  default, which would 404 anyway under `base: "/myTome/"`. It renders a
  stored `ImageSource` through `useImageSrc` (see **Object URLs** above) and
  holds no lifetime of its own. It takes **two** style props, because its two
  branches are not always the same shape: `sx` sizes both — what a thumbnail
  wants, one fixed box whichever renders — and `imageSx` lands after it on the
  image alone. The dashboard is the one caller that needs the split: it shows
  the cover whole (`objectFit: "contain"` over a transparent ground, so nothing
  is cropped and a small image is not stretched), while the monogram, having no
  proportions of its own, fills the same fixed box. It reaches the thumbnail
  through `ImagePicker`, which forwards `imageSx` for exactly this caller.
  Compose them with MUI's array form rather than a second spread — an
  `SxProps` may be an array or a callback, and spreading two widens every
  property past what `sx` accepts, which `tsc` catches.
- `ImagePicker.tsx` — clickable image-or-placeholder tile used in the Tome
  and Element edit forms; opens a dialog to paste an image URL or upload a
  file (`imageFrom` from `services/store.ts` turns either into an
  `ImageSource`). Used by `TomeFormDialog.tsx`, `../pages/ElementPage.tsx` and
  `../pages/TomeDashboardPage.tsx` in place of the old inline URL field +
  upload button, adding a live preview and the ability to remove an image. It
  forwards an optional `imageSx` to its `CoverThumbnail` — see that entry for
  the one caller that needs it.
  The tile is a `CoverThumbnail`; the dialog holds the picked **`File`**, not
  a URL made from it, so its preview is three derived values under ordinary
  `??` precedence — picked file, then typed URL, then the stored image. That
  is `imageFrom`'s own order, so the preview always shows what Save would use.
- `ElementTypeIcon.tsx` — renders an `ElementType`'s chosen icon (falls back
  to a generic glyph when unset); also exports `elementTypeIconOptions`, the
  curated icon set used by the picker in `../pages/ElementTypesPage.tsx`.
  Used anywhere an ElementType's name is shown — `SideNav`, the type
  configuration cards/form, `ElementListPage` headers, and relationship rows.
  Plot items reuse it for their own `icon` key rather than standing up a second
  icon registry, so the name is a slight misnomer; the curated list also carries
  a few beat-shaped icons (`Repeat`, `Favorite`, `Warning`, `HourglassTop`) for
  that use.
- `PlotBeatCard.tsx` — the beat itself: title, description, attached-element
  chips, and the drag handle. It is separate from `PlotGrid` so that the card
  knows nothing about the cell holding it. **It always draws `item.name`**, since
  the gutter beside it belongs to the spine row — the old `labelMode` and
  `showDot` props are gone, and the dot now lives on the track. That label is an
  `InlineTextField`, edited on the card, and three things about it are
  load-bearing:
  - **The field is rendered even when the beat has no label**, because it is the
    only way to give it one; a slot that appeared on hover would make every card
    jump as the pointer crossed it. What hides instead is the *placeholder*, via
    a rule on the card's own `sx` — most beats never get a label, and a grid of
    cards each reading "BEAT LABEL" would be worse than the thing it advertises.
  - **Its wrapper stops the click.** The whole card is `role="button"` and opens
    the beat dialog, so without that guard a click meant for the caret would open
    a dialog over it. The card's `onKeyDown` needs no such guard — it already
    ignores events whose target is not the card itself, which is what lets you
    type in the field at all.
  - **It saves through `store.setPlotItemName`, never `savePlotItem`.** That one
    reads `icon`, `dotColor` and `dotVariant` straight off its input with no
    fallback to the stored row, so naming a beat by passing a partial item would
    strip how it is drawn. There is a test for exactly that.

  **It does not call
  `useSortable`** — whichever container registered the beat owns the node ref and
  the transform and passes `dragHandle` down, because the draggable node is the
  cell rather than the card. The drag handle is a plain `Box component="button"`,
  **not** an `IconButton` — ButtonBase routes key events through its own
  `getButtonProps` wrapper, which swallows the `onKeyDown` that dnd-kit's
  `KeyboardSensor` needs to start a lift. The hover reveal for that handle lives
  on the card's own `sx`, so it travels with the card into whatever layout holds it.
- `BeatDot.tsx` — the beat's marker on the track: colour, variant, icon. A
  hand-rolled `TimelineDot`, because MUI's reads `Timeline`'s context and ships an
  `align-self` meant for a `TimelineSeparator`. Used only by `PlotGrid`'s `Track`.
- `RemoveEmptyRowsButton.tsx` — drops every row no plot stands on. It counts
  against the **tome's** beats, not the ones on screen: a row can be empty in
  every visible column and still be occupied by a plot that is not shown, so hand
  it `observeTomePlotItems`.
- `PlotGrid.tsx` — **every** plot drawing goes through here: one plot is one
  column, and compare is the same component with more. Beats sharing a row line
  up and a plot with nothing on a row shows a gap. The alignment is CSS, not
  arithmetic: every row's cells are siblings of one `display: grid`, so the grid
  row grows to its tallest card and the rest stretch beside it. Consequences
  worth knowing before editing it:
  - **The track is drawn cell by cell and has to look continuous.** Each segment
    overshoots its cell by `INSERT_STRIP` so the line bridges the hover-to-insert
    strip between two rows, which is also why a cell carries no vertical padding —
    the card does, via `my`. Break either and the line turns to dashes. Check it
    by measuring the segments' rects for gaps rather than by eye.
  - **The track runs the full height of its column**, so every column is a lane
    and the dots mark where that thread has beats. Whether a plot has anything on
    a row is said by the cell — a card, or a dashed gap — never by the line
    stopping. `trackPart` therefore asks only where a row sits among the *drawn*
    rows, and the only special cases are the outermost two, which stop flush with
    their cell instead of overshooting so the line does not trail off past the
    grid. It is why no span is computed any more.

    This was twice wrong before, and both are easy to reintroduce. Drawing the
    line only between a plot's first and last beat leaves the first beat with no
    line above its dot and the last with none below — the ends read as half-drawn
    rather than as ends. And asking `i > first` and `i < last` *independently* is
    true on both sides of that span as well as inside it, so every row past the
    last beat drew a top half and no bottom — a line that began and stopped in
    mid-air — and every row before the first drew the mirror image. Check any
    change at four places: the first drawn row, the last, a gap between two
    beats, and a column whose plot has no beat at either end.
  - **A drag is two gestures, chosen by what is in the target cell.** Dropping on
    a gap is `movePlotItemToRow` (a move, opening a gap behind it). Dropping on
    another beat is `reorderPlotItems` with an `arrayMove` — the ordinary
    drag-to-reorder, which shifts the beats in between. It used to be
    `movePlotItemToRow` in both cases, so dragging a beat three places down
    swapped it with whatever was there and left the two in between untouched.
  - **Quiet runs collapse.** `QUIET_RUN_MIN` consecutive rows that *nothing on
    screen* stands on become one "n quiet rows" line, expandable per run and held
    in component state. Without it a single plot against a deep spine is a page of
    empty cells. A run of one or two is left alone: that is the shape of the story
    and is also somewhere you might want to drop a beat.
  - **One `DndContext` for the whole grid.** A column's cells are interleaved with
    every other column's in DOM order, so a provider cannot wrap one column.
    `sameColumnOnly` filters the droppable candidates by `plotId` instead, which
    also stops the grid highlighting a cell that would refuse the beat.
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
    labels hold while the columns scroll horizontally past them. Both it and the
    column floor shrink below `sm` (`GUTTER_WIDTH_XS`, `MIN_COLUMN_WIDTH_XS`):
    136 + 280 overflows a 375px phone by a hair, and one plot that has to be
    nudged sideways to be read is worse than the timeline this replaced. The
    floor only bites with several columns anyway — one column is a `1fr`.
- `PlotItemDialog.tsx` — route-driven create/edit dialog for a `PlotItem`,
  including the multi-`Autocomplete` attachment picker. Attachments are plain
  associations to elements with no label — that is the whole difference from a
  `Relationship`, so do not grow a description field here.
- `PlotPicker.tsx` — the tome's plots as tabs, and **the whole of "compare"**:
  clicking a tab shows that plot alone, and the toggle inside each tab adds or
  removes it as a further column. Also create/rename/delete, all of which act on
  the primary plot (`columns[0]`). Three things about the tabs are load-bearing:
  - **A tab renders exactly one DOM node.** `Tabs` measures its indicator off
    `tabList.children[index]`, so a wrapper element breaks it — and it clones its
    children to inject `selected`/`indicator`/`onChange`, which is why every prop
    is spread through to the inner `Tab`.
  - **Both nested buttons are plain `Box component="button"`, with native
    `title` rather than `Tooltip`.** `ButtonBase` routes key events through its
    own wrapper and eats the Space that dnd-kit's `KeyboardSensor` needs to lift;
    `Tooltip` clones its child and costs the drag handle its activator ref, which
    the sensor refuses to lift without. The tab root is `component="div"` so it
    can legally contain them.
  - **`primary` is passed in, not read off `selected`.** `Tabs` injects a
    `selected` prop when it clones a tab, but it is not part of `TabProps` and
    reading it fails `tsc`.

  Its "New plot" dialog carries the plot-template picker. The dialog's fields are
  uncontrolled, so it resets the form on open: MUI keeps a dialog's children
  mounted until the close transition ends, and without the reset a cancelled
  rename followed straight by "New plot" reopens carrying the old plot's name.
- `PlotTemplatePicker.tsx` — the story-structure select shared by
  `TomeFormDialog` and `PlotPicker`, with a preview of the beat count and beat
  labels the chosen structure will write. Controlled: the parent owns the id.
- `WriteItemRow.tsx` — one row of the Write table. It owns its own 250ms hover
  timer and `Popover` sample rather than letting the page track which of n rows
  is hovered. The `Popover` is `pointerEvents: "none"` so it never becomes the
  mouse target and bounces `mouseleave` off the row beneath it. Also holds the
  two display rules the table needs and nothing else does: a date read as
  "Today" / "3 days ago" for a week and as a plain date after that, and
  "Main plot · Departure" collapsing to "3 beats" (with the full list in a
  tooltip) once naming them all would not fit.
- `WriteItemTypeIcon.tsx` — glyph for a `WriteItemType`. Unlike
  `ElementTypeIcon` there is no registry or fallback: the four types are a
  closed union, so the mapping is total.
- `SaveStatus.tsx` — the Write editor's autosave indicator. Stateless; see the
  autosave section above for the rules that keep it honest.
- `EmptyState.tsx` — shared "nothing here yet" placeholder.
- `ColorModeToggle.tsx` — fixed-position light/dark toggle, rendered once in
  `App.tsx` so it's available on every route.
