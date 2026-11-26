# Plot Grid Inline Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit a beat's title, description, dot (colour, variant, icon) and attached elements directly on the plot grid.

**Architecture:** Four single-purpose store mutations in `services/plots.ts`, mirroring `setPlotItemName`. Two components are pulled out of `PlotItemDialog` so the dialog (now the create form) and the card share them: `DotStyleControls` and `ElementAttachPicker`. `PlotBeatCard` stops being a button. It gains inline fields, a ⋮ menu, and an attach chip. `BeatDot` becomes the button that opens the dot popover.

**Tech Stack:** React 19, MUI, Dexie, vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-26-plot-grid-inline-editing-design.md`

## Global Constraints

- Pages and components call `store`, never `db`. New mutations go in `plotsStore` in `services/plots.ts`, which the `store.ts` barrel already spreads.
- Validation stays outside mutations: the card refuses to save a blank title. `setPlotItemTitle` only trims.
- None of these mutations touches rows or `plotRowId`, so none calls `syncPlotSortOrder`.
- Timestamps are ISO strings through `now()`.
- MUI only, theme tokens, no hex, no hand-written `<svg>`. Type-only imports use `import type`.
- Use a plain `Box component="button"` rather than `IconButton` for any control that sits inside a drag cell (see the drag-handle comment in `PlotBeatCard`).
- The gates are `npm run build` and `npm test`. A green suite does not prove UI behaviour, so drive the app (Task 6).

## Review Focus

1. **Clearing the title:** the author clears it and tabs away. Expected: the stored title stays and the field shows it again (Task 2 builds this; Task 6 checks it).
2. **Saving one field:** a single-field save must leave every other field alone. Saving the dot keeps `name`, `title` and `attachedElementIds`, and saving attachments keeps the dot. Task 1 tests this, as the `setPlotItemName` "leaves the rest alone" test does.
3. **Partial dot patch:** setting only `dotVariant` must not reset `dotColor` or `icon`. Task 1 tests this.
4. **Clearing the icon:** choosing "None" must remove the icon. It must not leave the old one, and it must not store `""`. Task 1 tests `icon: undefined` in the patch.
5. **Clicks inside the card:** clicking a field, chip, dot or menu inside the grid cell must not start a drag or open another surface. Task 6 checks this by hand.

---

### Task 1: Store mutations

**Files:**
- Modify: `src/services/plots.ts` (beside `setPlotItemName`, ~line 205)
- Test: `src/services/__tests__/plots.test.ts` (new `describe` blocks after `setPlotItemName`)

**Interfaces:**
- Produces:
  - `setPlotItemTitle(itemId: string, title: string): Promise<void>`: trims the title.
  - `setPlotItemDescription(itemId: string, description: string): Promise<void>`: trims trailing whitespace only (`trimEnd`), so leading indentation and inner line breaks stay.
  - `setPlotItemDot(itemId: string, patch: Partial<Pick<PlotItem, "dotColor" | "dotVariant" | "icon">>): Promise<void>`: writes only the keys present in `patch` (`"icon" in patch`). `icon: undefined` removes the stored icon.
  - `setPlotItemAttachments(itemId: string, elementIds: string[]): Promise<void>`: writes the list after removing duplicates, keeping first-seen order.
  - Each one also writes `updatedAt: now()`.

- [ ] **Step 1: Write failing tests.** Use `makeTome` / `addBeat` / `store.savePlotItem` as the existing `setPlotItemName` tests do:
  - `setPlotItemTitle`: `"  The ford  "` is stored as `"The ford"`. `name`, `description`, the dot fields and `attachedElementIds` are unchanged (`toMatchObject`).
  - `setPlotItemDescription`: `"Line one\nLine two  \n"` is stored as `"Line one\nLine two"`.
  - `setPlotItemDot`: on a beat with `{ dotColor: "warning", dotVariant: "outlined", icon: "Place" }`, calling `setPlotItemDot(id, { dotVariant: "filled" })` gives `{ dotColor: "warning", dotVariant: "filled", icon: "Place" }`. Then `setPlotItemDot(id, { icon: undefined })` gives `stored.icon` equal to `undefined` and `dotColor` still `"warning"`.
  - `setPlotItemAttachments`: `["a", "b", "a"]` is stored as `["a", "b"]`. `title`, `dotColor` and `writeItemIds` are unchanged.
- [ ] **Step 2:** Run `npx vitest run src/services/__tests__/plots.test.ts`. Expected: FAIL with "is not a function".
- [ ] **Step 3:** Implement the four mutations in `plotsStore`. Each is a single `db.plotItems.update`. For `setPlotItemDot`, build the changes object from the keys present in `patch`; Dexie removes a field whose update value is `undefined`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `Plots: single-field mutations for a beat's title, description, dot and attachments`.

### Task 2: `InlineTextField` restores a required value on blur

**Files:**
- Modify: `src/components/InlineTextField.tsx`

**Interfaces:**
- Produces: an optional prop `required?: boolean`. When it is true, a blur that leaves a blank draft (`draft.trim() === ""`) cancels any pending save, then resets `draft` and `latest.current` to `value`.
- The caller passes a `save` that does nothing for a blank value (Task 3). That covers a debounce that fires before the blur.

- [ ] **Step 1:** Check whether `useAutosave` / `autosave.ts` can cancel a pending save. If it can't, keep the existing flush-on-blur and rely on the caller's blank-skipping `save`. Do not add a new API to `autosave.ts` for this. Extend the header comment with one paragraph explaining `required`.
- [ ] **Step 2:** Run `npm run build`. Expected: passes. Behaviour is checked in Task 6, because this component cannot be tested under `node`.
- [ ] **Step 3:** Commit, together with Task 3. The prop has no caller until then.

### Task 3: The card edits in place

**Files:**
- Modify: `src/components/PlotBeatCard.tsx`, `src/components/PlotGrid.tsx` (the `onOpenItem` and `onOpen` props, ~lines 179, 208, 429, 711, 722, 771), `src/pages/PlotPage.tsx:305`

**Interfaces:**
- Consumes: `store.setPlotItemTitle` and `store.setPlotItemDescription` (Task 1), and `InlineTextField`'s `required` prop (Task 2).
- Produces: `PlotBeatCard` without the `onOpen` prop. `PlotGrid` without `onOpenItem`, and `PlotPage` no longer passes it. The `plots/:plotIds/items/:itemId` route and the dialog's edit mode stay as they are.

- [ ] **Step 1: Card container.** Remove `role="button"`, `tabIndex`, `aria-label`, `onClick` and `onKeyDown` from the `Card`, and remove the `&:focus-visible` outline. Keep the hover border and the `.drag-handle` reveal. Add `.beat-menu` to that reveal, along with `:focus-visible` on the menu button.
- [ ] **Step 2: Title.** Replace the title `Typography` with a `Box` (`typography: "h6"`, `fontSize: "1.15rem"`, `component="h3"`) wrapping an `InlineTextField`:
  - `required`, `placeholder="Untitled beat"`, `ariaLabel={`Title of ${item.title}`}`
  - `save={(t) => (t.trim() ? store.setPlotItemTitle(item.id, t) : Promise.resolve())}`
- [ ] **Step 3: Description.** Always render a `Box` (`color: "text.secondary"`, `mt: 0.5`, `lineHeight: 1.5`) wrapping an `InlineTextField`:
  - `multiline`, `placeholder="Add a description"`, `ariaLabel={`Description of ${item.title}`}`, `save` → `setPlotItemDescription`
  - Give it class `beat-description` and hide the placeholder until hover or focus, using the same `sx` rule as `.beat-label` (extend that selector to the textarea).
  - Note: `InputBase` multiline keeps newlines, so the `pre-line` reading is preserved.
- [ ] **Step 4: Delete menu.** In the foot row, before the Write button, add a plain `Box component="button"` with class `beat-menu`, `aria-label={`More actions for ${item.title}`}` and a `MoreVertIcon` inside. It opens an MUI `Menu` with one `MenuItem`, "Delete beat". That item calls `confirmAction(`Delete "${item.title}" from this plot?`, () => store.deletePlotItem(item))`, with `confirmAction` from `useConfirm()`.
- [ ] **Step 5: Remove the dead props.** Delete `onOpen` from the card, and `onOpen` / `onOpenItem` through `PlotGrid` and `PlotPage`. `noUnusedLocals` will report anything left over.
- [ ] **Step 6:** Run `npm run build && npm test`. Expected: both pass.
- [ ] **Step 7:** Commit with Task 2: `Plot grid: edit a beat's title and description on the card`.

### Task 4: Dot popover, with controls shared with the dialog

**Files:**
- Create: `src/components/DotStyleControls.tsx`, `src/components/BeatDotPopover.tsx`
- Modify: `src/components/BeatDot.tsx`, `src/components/PlotItemDialog.tsx`, `src/components/PlotGrid.tsx` (~line 747, where `BeatDot` is drawn)

**Interfaces:**
- Consumes: `store.setPlotItemDot` (Task 1).
- Produces:
  - `DotStyleControls({ dotColor, dotVariant, icon, thread, onChange }: { dotColor: PlotDotColor; dotVariant: PlotDotVariant; icon: string; thread: string; onChange: (patch: { dotColor?: PlotDotColor; dotVariant?: PlotDotVariant; icon?: string }) => void })`. It has three labelled groups:
    - **Colour:** the seven `plotDotColors` swatches. `grey` is labelled **"Thread"** and filled with `thread`; the others use `${color}.main`. Move `colorLabels` here and rename `grey` to "Thread".
    - **Variant:** Filled / Outlined, as two sample dots in `thread`/colour.
    - **Icon:** a grid of `elementTypeIconOptions` buttons plus "None" (`icon: ""`).
  - `BeatDot` gains an optional `onClick?: (anchor: HTMLElement) => void`. When it is present, `BeatDot` renders as a `Box component="button"` with `aria-label={`Dot for ${item.title}`}`, stops `pointerdown` and `click` propagation, and keeps its size.
  - `BeatDotPopover({ item, thread, anchor, onClose })` renders a `Popover` holding `DotStyleControls`. Its `onChange` maps `icon: ""` to `undefined` and calls `store.setPlotItemDot(item.id, patch)`.

- [ ] **Step 1:** Create `DotStyleControls`. Replace the dialog's swatch block and `ToggleButtonGroup` with it, adding an `icon` group in place of the dialog's Icon `TextField`. The dialog gets `thread` from a new required prop, which `PlotPage` supplies with `threadColor(theme, threadIndex(plotId))`; `PlotPage` already computes `threadIndex` for the grid.
- [ ] **Step 2:** Make `BeatDot` clickable and create `BeatDotPopover`. In `PlotGrid`'s beat cell, keep the anchor in `useState<HTMLElement | null>` and render the popover. An open popover is not a route.
- [ ] **Step 3:** Run `npm run build && npm test`. Expected: both pass.
- [ ] **Step 4:** Commit: `Plot grid: style a beat's dot from a popover on the track`.

### Task 5: Attach and detach elements on the card

**Files:**
- Create: `src/components/ElementAttachPicker.tsx`
- Modify: `src/components/PlotItemDialog.tsx`, `src/components/PlotBeatCard.tsx`, `src/components/PlotGrid.tsx` (the card needs `elements`; check what the grid already receives)

**Interfaces:**
- Consumes: `store.setPlotItemAttachments` (Task 1).
- Produces:
  - `ElementAttachPicker({ elements, types, value, onChange, autoFocus?, label })`: the dialog's grouped, sorted `Autocomplete` (`multiple`, `disableCloseOnSelect`, `ElementTypeIcon` options and chips), with `value: Element[]` and `onChange: (value: Element[]) => void`.
  - `PlotBeatCard` gains `elements: Element[]`, the tome's elements for the picker.

- [ ] **Step 1:** Extract `ElementAttachPicker` from the dialog unchanged in behaviour, and have the dialog use it.
- [ ] **Step 2: On the card:**
  - Every attachment chip gets `onDelete`. It calls `setPlotItemAttachments` with that id removed, and stops propagation.
  - After the chips, add an always-visible small "+" chip: `icon={<AddIcon />}`, `aria-label={`Attach elements to ${item.title}`}`. It opens a `Popover` containing `ElementAttachPicker` with `autoFocus`. Each change saves straight away through `setPlotItemAttachments(item.id, value.map((e) => e.id))`.
  - Render the chip row even when there are no attachments, so the "+" is always there.
- [ ] **Step 3:** Run `npm run build && npm test`. Expected: both pass.
- [ ] **Step 4:** Commit: `Plot grid: attach and detach a beat's elements on the card`.

### Task 6: Verify in the running app

- [ ] **Step 1:** Start the `myTome` launch config. Open a tome's plot page with two plots side by side.
- [ ] **Step 2:** Check each Review Focus line and each goal:
  - Edit a title, then refresh the page: the change persisted.
  - Clear a title and tab away: the old title comes back.
  - Type a two-line description: the line breaks survive a refresh.
  - Open the dot popover: "Thread" shows the plot's colour. Changing the variant keeps the colour, and "None" removes the icon.
  - Attach two elements and remove one.
  - Dragging by the handle still reorders. Clicking a field, chip, dot or ⋮ never starts a drag.
  - Delete from ⋮ confirms first.
  - The `…/items/:itemId` link still opens the dialog.
  - Repeat the checks at `mobile` width and in light mode.
- [ ] **Step 3:** Fix whatever fails and commit, noting how it was verified in the commit message.
