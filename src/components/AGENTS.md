# src/components

Reusable UI for myTome: React 19 function components with hooks, styled with
MUI. If a `<Route>` in `App.tsx` mounts it directly, it is a page and lives in
`../pages`; if it is composed into a page or the workspace layout, it lives
here. Lexical nodes and plugins live in `../lexical` — they are not MUI
components, though `ProseField` mounts them too.

`CLAUDE.md` in this directory is just `@AGENTS.md`, so this file loads whenever
an agent works in `src/components`. It covers `../pages` and `../lexical` as
well; read it before touching either.

**The reasoning lives in the code.** A component with a non-obvious rule
explains it in its own header comment — `PlotGrid`, `PlotPicker`,
`PlotBeatCard`, `ProseManuscript`, `ProseField`, `CaretAtPointPlugin`,
`ProseToolbarPlugin`, `ManuscriptExportDialog`, `ManuscriptPrint` and others.
Read it before editing. This file holds the rules that span components, and the
traps no single file makes visible. Data, build and routing rules are in the
root `AGENTS.md`.

## Shape and styling

- One component per file, named for its export (`TomeFormDialog.tsx` →
  `export function TomeFormDialog`).
- **Reach for an MUI component before writing bespoke markup** — that is project
  policy, not a style nit. Style with `sx` / `styled()` and theme tokens
  (`text.secondary`, `divider`, `color="error"`, …) so both colour modes stay
  correct. No `.css` files, no hex colours (`SideNav`'s permanent `#27201c` is
  the one exception), no inline `<svg>` icons.
- **One breakpoint: MUI's `sm`.** Don't invent others. Wide content scrolls
  inside its own scrollport, never the body. `PlotGrid` never stacks its
  columns at any width — stacked columns are not aligned, and alignment is the
  point.
- **Any image with a fallback is a `CoverThumbnail`.** Its monogram is why the
  app has no placeholder image asset; an `<img>` with a `/images/…` default
  would 404 under `base: "/myTome/"` anyway.
- **`ElementTypeIcon` is the only icon registry.** `PlotItem.icon` reuses it,
  which is why its curated list carries a few beat-shaped icons. Don't stand up
  a second one.
- Shared state is Context, page-local UI is `useState`, and a list only one
  page needs is observed in that page with `useObservable`. Pass callbacks as
  props — there are no custom events.

## MUI, dnd-kit and Lexical traps

Each of these bit in more than one component:

- **`ButtonBase` swallows the keys dnd-kit's `KeyboardSensor` needs.** It routes
  key events through its own wrapper, so a drag handle, or a button nested
  inside something draggable, is a plain `Box component="button"`, not an
  `IconButton`.
- **`Tooltip` clones its child**, which costs a drag handle its activator ref.
  Use a native `title` there.
- **`Select` and `Tabs` clone their children.** A `Divider` inside a `Select`
  becomes a blank, selectable option (`AuthorPicker` draws a border on the item
  instead). A tab must render exactly one DOM node and pass every prop through,
  or the indicator breaks (`PlotPicker`).
- **A `<button>` inside a `<form>` defaults to submit.** Give it
  `type="button"`, or Enter on it submits the form.
- **A dialog's children stay mounted until its close transition ends.** Reset
  uncontrolled fields on open, or a cancelled dialog reopens holding stale
  values (`PlotPicker`'s "New plot").
- **Compose `sx` with MUI's array form**, never by spreading two — an `SxProps`
  may be an array or a callback, and `tsc` rejects the spread.
- **Toolbar buttons suppress `mousedown`**, or focus leaves the editor, the
  selection collapses, and the command applies to nothing. Go through
  `ToolButton`. `ToolbarPlugin` renders from a `ToolbarItem[][]` config
  (`defaultToolbarItems` or an `items` prop); don't hand-place buttons.
- **Anything appended to `<body>` over the focus surface needs a z-index above
  the dialog.** `MentionsPlugin`'s paper sits at `zIndex.tooltip`; without it,
  typing `@` looks like nothing happened. `ColorModeToggle` is fixed at
  `zIndex.modal + 1`, which is why `FocusSurface`'s header keeps `pr: 6`.
- **`savePlotItem` writes `name`, `icon`, `dotColor` and `dotVariant` exactly as
  given**, with no fallback to the stored row, so a partial item wipes them.
  Pass the whole item (`PlotItemDialog` carries `item.name` through a save it
  no longer edits), or use a narrow setter (`setPlotItemName`). Only the two id
  arrays and `plotRowId` fall back to the stored row.

## Object URLs: hold the Blob, derive the URL

- **`hooks/useObjectUrl.ts` is the only render-land caller of
  `URL.createObjectURL`.** Components hold `Blob`s and `File`s and call
  `useObjectUrl(blob)` or `useImageSrc(image)`. Never store a URL made from a
  blob, and never create one in a render body — each render would pin the Blob
  for the life of the document.
- It is a layout effect, so a caller with a fallback doesn't paint the fallback
  first and then swap in the real image.
- A URL that lives for one *action* — the download in `BackupPage` and
  `ManuscriptExportDialog` — stays in its handler, with create, click and revoke
  together. Don't convert those.
- `imageHref` allocates nothing and is safe anywhere, render bodies included.

## The focus surface: one live editor, the rest static

Writing happens on `FocusSurface` — a `Dialog` over the workspace, full-bleed
below `sm`. `WriteEditorPage` mounts it with one text, `BeatManuscriptPage` with
a beat's texts in reading order, and both hand their rows to `ProseManuscript`.
`ProseField` applies the same design to a single field on the element, tome and
author pages.

**Every section is `StaticProse` until clicked, and exactly one `ProseEditor` is
mounted.** That keeps one `LexicalComposer`, one autosave machine writing one
row, one unambiguous `SaveStatus`, and a toolbar with no question of *which*
editor it drives.

**The premise under all of it: the static and live views take up exactly the
same space.** The click point is hit-tested against the editor's DOM *after*
the swap, so the caret lands on the clicked word only if nothing moved. So:

- Both render from `manuscriptStyles.ts` (`manuscriptSx(face)`). One differing
  `line-height` is enough to break it.
- `StaticProse` reproduces Lexical's DOM exactly, through the tag and class
  rules in `lexical/blocks.ts`. Keep `bold` and `italic` in `proseTextTheme`:
  Lexical gives a run one inner tag, so bold-italic keeps its slant only through
  the class.
- **Nothing may change size on activation.** A section header is the same
  height active or not, the active mark is a gutter `::before` (never a border),
  the insert-`+` strip is zero-height, and a field wrapper's padding and margins
  match in both states. That is also why a prose field doesn't look like a
  `TextField`.
- `InlineTextField` deliberately doesn't swap: a one-line value has no caret to
  place, so it is always live, looks like text at rest, and flushes on blur.
  Selects save on change.

Handing over from one editor to the next:

- **Redraw a section from the page's `edits`, not from the row.** The write and
  its live-query echo are not synchronous, so the row briefly shows old text.
- **A page that sweeps blank drafts must `await flushRef.current` first**, or a
  draft the author just typed into is still blank in the database and gets
  deleted.
- **The sweep is deferred one tick** past `StrictMode`'s dev remount, guarded by
  an `alive` ref. Don't simplify that timeout away.
- The editor's change handler compares the serialized document before
  scheduling a write. Lexical reports selection-only updates through the same
  callback, and fires once on mount.
- **Focus synchronously; never wait on an animation frame.** None arrives in a
  hidden tab or a throttled compositor, and the section would silently swallow
  typing. `CaretAtPointPlugin` refines the caret afterwards in a `setTimeout`;
  its header covers the three ways the caret ends up at the start of the block.
- Undo doesn't cross a section boundary, because the history dies with its
  editor. That's accepted, since autosave has already persisted the section.

Mentions render in both views (`StaticProse` keeps `data-mytome-mention`), and
one delegated click handler in `ProseManuscript` serves the whole manuscript.
The element page mounts no `MentionsPlugin`; its relationships already do that
job.

`ProseToolbarPlugin` picks by input, not width: a pill over the selection on a
pointer device, a strip docked above the keyboard on `(pointer: coarse)`. The
pill exists only for a selection, and must not vanish while one of its own
controls has focus — see its `anchorNode` guard.

## Pages with no Save button

The Write editor, a beat's manuscript, the element page, the tome overview and
the author profile all autosave. `SaveStatus` is the only sign a write
happened, so it is stateless: it shows whatever state it is given. The timing
lives in `../hooks/autosave.ts` (tested), bound to React by `useAutosave`.
Change timing there, not in a page.

- **One prose field is live at a time.** Each live editor owns an autosave
  machine, and two would write one row.
- **A click that reaches the page clears the active field.** `ProseField` stops
  its own clicks; `InlineTextField` clears it on focus, for the keyboard.
- **Writes are patches.** `store.updateElement`, `updateTome` and
  `updateAuthor` re-read the row inside their transaction. Never assemble a
  whole row from what the page last observed.
- **One stable `onSaveState` per page**, feeding one `SaveStatus`.
  `InlineTextField` re-reports whenever that callback's identity changes, so a
  fresh one each render lets the last field to report overwrite the one being
  edited.
- `SaveStatus` sits after the header's `flex: 1` spacer, so its changing width
  moves nothing.
- **Rows created blank at a click site sweep on unmount**: texts, elements and
  author profiles. The tome overview has no sweep, because a tome is created
  deliberately, with a title. The author sweep ignores credits: "New author…"
  credits the draft at the click, and `discardAuthorIfBlank` removes the credit
  along with the row.

## The plot page

`PlotPage` draws one or more plots as columns of one `PlotGrid`.

- **`selected` and `columns` are different lists.** `selected` is the URL's
  order, and its first id is the **primary** plot: the tab marked selected, and
  what rename, delete, "Add item" and export act on. Turning a plot on appends
  to it. `columns` holds the same plots in tab order (`Plot.sortOrder`), and is
  what gets drawn. Never sort the URL: that would re-aim delete and export at a
  plot the author never selected.
- **The tabs are the only control over which plots are drawn.** Clicking a tab
  shows that plot alone. The toggle inside a tab adds or removes it, with
  `aria-pressed` carrying the real state, since `Tabs` has only one `value`.
  Columns are reordered only by dragging tabs; don't add a column drag, which
  would fight the beat drag in the same cells.
- **`PlotGrid` owns row actions** (insert, delete, name) and calls the store
  itself; the page supplies only `onSaveState`.
- The gutter holds the spine row's label and the card holds the beat label.
  Both are `InlineTextField`s. An unnamed row shows its position as a
  placeholder, so a chosen name looks different from a fallback.
- A beat's attachments are plain links to elements with no label. That is the
  whole difference from a `Relationship`, so don't add one.
- `RemoveEmptyRowsButton` counts the whole tome's beats, not the ones on screen.
- **Read `PlotGrid.tsx` before editing it.** Its drag gestures, collision
  detection, keyboard coordinates, track drawing and quiet-row collapsing are
  all documented there, and the track and drag rules have regressed before.
  Check a track change at four places: the first drawn row, the last, a gap
  between two beats, and a column with no beat at either end.

## Composing text into beats

- `attachedElementIds` is an unordered set. `writeItemIds` is the beat's text
  **in reading order**, authored and preserved exactly. One text may be
  composed into several beats.
- Deleting a beat never deletes its text; deleting a text removes it from every
  beat.
- Composition is edited in the beat's manuscript, not in `PlotItemDialog`.
  Sections reorder through "Move earlier" / "Move later" in the section menu,
  not by drag.
- **"Remove from this beat" and "Delete text permanently" are separate, named
  controls.** Never merge them.
- One add menu, opened from two places: the button under the manuscript
  (appends) and the `+` in the gutter above a section (inserts there). Keep both
  offering the same options.
- A position counts resolved sections and is mapped back through the anchor
  section's id. `createDraftWriteItem`'s `at` inserts inside its own
  transaction — never create and then reorder.
- `WriteItemPicker` shows texts already used elsewhere, with a count, and hides
  only this beat's own. Picks land in the order they were picked.

## Templates are create-time seeds

`models/TomeTemplate.ts` seeds element types only; `models/PlotTemplate.ts`
seeds story structures (`noPlotTemplateId` is a real option with no entry).
Both appliers run once, at creation, only add rows, and record nothing, so a
second run would add a second copy. Don't build "change the template later"
without reconciliation. Template fields are always `required: false`. In "New
plot", the name is optional when a structure is chosen, and defaults to the
structure's name.

## Manuscript export UI

The export rules are in the root `AGENTS.md`. On the UI side:

- `ManuscriptExportDialog` owns the choices and the two transports.
  `buildManuscript` reruns on every toggle, so the counts shown are the file's.
  "Appears more than once" names each repeated text and the beats it appears
  in — don't reduce it to a count. Each switch's caption says what that page
  will carry, or why there won't be one.
- The dialog prepares DOCX images (bytes, size, a PNG redraw of anything Word
  won't embed) because `manuscriptDocx.ts` must stay pure. A cover pasted as a
  URL can't go into the DOCX, and the dialog says so before the download.
- `ManuscriptPrint` is mounted only while printing: `flushSync` before
  `window.print()`, removed on `afterprint`.

## Tables

`WriteListPage` is the app's only table, so it sets the pattern for the next:

- The mouse gets the whole row; the keyboard gets the title, which is a real
  button and calls `stopPropagation`, so a click on it doesn't navigate twice.
- Every column header sorts, so there is no separate sort control.
- Below `sm`, fold secondary columns and trim cell padding so the table doesn't
  grow a horizontal scrollbar.
- A hover-revealed row action stays visible below `sm`, because a phone has no
  hover. Hide it with `opacity`, not `display`, so `:focus-visible` can still
  show it.

## Below `sm` the nav is a top bar

`SideNav` becomes a fixed-height strip (`NAV_BAR_HEIGHT` is a `height`, not a
`minHeight`) that scrolls only sideways. `WorkspaceLayout`'s `gridTemplateRows`
(`"auto 1fr"` at `xs`, `"1fr"` at `sm`) stops that bar from absorbing spare
height. Keep both values.

## The library page, policy pages and integrations

- **An empty *library* gets the full `LibraryGuide`. An empty search result
  gets `EmptyState`** — those tomes exist. Once the library has tomes, the guide
  shrinks to `GuideStrip`. Dismissing it isn't deleting it: the guide keeps
  `/tomes/guide`, linked from the footer. Any UI that hides something
  permanently owes the author a way back.
- **Guide copy says what an author gets, never what the code holds** — no
  "element type", "plot row" or "spine". Number only lists that are sequences.
- `SpineDiagram` is an illustration with sample beats, drawn to match
  `PlotGrid` by hand.
- `PolicyProse` exists so the two policy pages can't drift apart. Don't grow it
  into a general page scaffold.
- **An integration with no config renders as prose with nothing to click**
  (`DriveSyncCard` without `VITE_GOOGLE_CLIENT_ID`). Sync is a button, never a
  background loop, and a reload starts disconnected because the token lives
  only in memory.
- `RestoreDialog` shows, per tome, what a restore would do before doing it,
  using `store.summarizeBackup`. "Replace everything" opens the app-wide
  confirm on top of it; that confirm's fixed "Delete permanently" wording is
  accurate, so don't fork the provider. `BackupPage` is the only place that
  touches the DOM for backups.

## Only the browser shows these

The `node` suite cannot reach layout, timing, focus or stacking. Drive the app
(the `myTome` launch config) after touching any of:

- caret placement and whether the static and live views match
- focus timing, including in a hidden tab
- anything floating over the focus surface
- the selection pill surviving scroll and resize inside its own controls
- drag and drop across rows of very different heights, by mouse and keyboard
- the nav bar at 375px on a tome with many plots
- image waits during export, and print output in dark mode

## Keeping this file small

Put a component's reasoning in its header comment, where the next person
editing it will see it. Add here only a rule that spans components, or one
someone would break without opening the file that explains it. Record how
something was verified in the commit message, not here.
