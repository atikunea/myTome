# Story plotting implementation plan

> Supersedes the completed "Element relationships" plan (shipped in `82b979a`).

## Feature summary

A tome gains a **plotting/outlining tool** rendered with MUI's `Timeline` (`@mui/lab`). Each
tome can hold any number of named **plots** (main plot, a subplot, a POV track), and each
plot holds an ordered list of **plot items**. An item carries a short spine `name` (the
label beside the track — "Chapter 1"), a `title`, a `description`, an optional `icon`, and
an optional dot `color`/`variant`. Items render through a single reusable `TimelineCard`
component.

Order is authored, not derived: the author inserts a new item **before or after** any
existing item by clicking the connector stem in the gap, **drags items by a handle** to
reorder, and **clicks a card** to open a dialog that edits the item and attaches elements
to it.

**Attachments are not relationships.** They are undescribed, unlabelled associations from a
plot item to any number of elements in the same tome — "this beat involves Ada, the Manor,
and the Sword." They are stored on the item, not as `Relationship` rows, and never appear in
an element's Relationships section.

## Naming

The domain records are **`Plot`** and **`PlotItem`**, deliberately *not* `Timeline`/
`TimelineItem`, so nothing in this codebase ever collides with `@mui/lab`'s exported
`Timeline` and `TimelineItem` components and no import aliasing is needed anywhere.

The split is: **a plot is the record; a timeline is how it's drawn.** So anything that
stores, queries, or validates uses plot vocabulary (`Plot`, `PlotItem`, the `plots`/
`plotItems` tables, `savePlotItem`, `/plots/:plotId`), while the two components that exist
purely to produce MUI timeline markup keep timeline vocabulary (`TimelineCard`,
`TimelineConnectorInsert`) — `TimelineCard` renders exactly one MUI `TimelineItem` row, and
naming it after that is clearer than naming it after the record it happens to display.

## Confirmed decisions

- **Multiple named plots per tome.** A `Plot` record exists; the tome auto-creates a "Main
  Plot" the first time the page is opened, so the author never faces an empty picker.
- **Drag and drop via `@dnd-kit`** (`core` + `sortable` + `utilities`) — chosen over native
  HTML5 drag events for keyboard-accessible reordering.
- **Editing happens in an MUI `Dialog`**, opened by a route (like `TomeFormDialog`) so the
  back button and deep links work, with the timeline still visible behind it.
- **Drag is on a handle, not the whole card.** The card's own click opens the editor;
  making the whole card draggable would make those two gestures fight. Each card gets a
  `DragIndicator` handle in its top-left corner.
- **New items are created on save, not on stem click.** Clicking a stem navigates to an
  insert route carrying the target index; the dialog persists at that index when saved.
  A cancelled dialog leaves no empty orphan item behind.

## New dependencies

```bash
npm install @mui/lab @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

`@mui/lab`'s major version must track `@mui/material` (currently `^9.3.1`) — `Timeline` and
its parts live only in lab, not in core.

## Data model

### `src/models/Plot.ts`

```ts
export type PlotDotColor =
  | "grey" | "primary" | "secondary" | "success" | "warning" | "error" | "info";

export interface Plot {
  id: string;
  tomeId: string;
  name: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlotItem {
  id: string;
  tomeId: string;          // denormalized: powers tome-scoped cascade deletes
  plotId: string;
  name: string;            // spine label rendered in TimelineOppositeContent, e.g. "Chapter 1"
  title: string;
  description: string;
  icon?: string;           // key into elementTypeIconOptions (see "Icons" below)
  dotColor?: PlotDotColor;
  dotVariant?: "filled" | "outlined";
  attachedElementIds: string[];  // always an array, never undefined — see multiEntry note
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

`name` is optional in practice (blank renders no opposite content); `title` is what the card
leads with, matching the wireframe where "Chapter 3" sits on the spine and "Calm before the
storm" heads the card.

### Ordering: dense integers, renumbered per mutation

`sortOrder` is a dense `0..n-1` integer sequence within a plot. Every mutation that changes
ordering (insert, move, delete) renumbers **the whole plot** inside one Dexie transaction.

This is deliberately not fractional/midpoint indexing. Plots are chapter- and beat-scale
(tens of items, not thousands), a full renumber is a single indexed range write, and dense
integers avoid float drift and rebalancing entirely. The `[plotId+sortOrder]` compound index
makes the ordered read a direct range scan.

Determinism matters for the drag interaction: because the renumber is a pure function of the
submitted id order, the `liveQuery` echo that follows a drag produces exactly the order
already on screen, so the optimistic local order never flickers back.

### Attachments: array + multiEntry index

`attachedElementIds` is a plain string array on the item — no join table, since an
attachment carries no data of its own. Dexie's multiEntry index `*attachedElementIds` makes
the reverse question ("which plot items reference this element?") an indexed lookup rather
than a scan, which is what the element-delete cascade needs.

Dexie's multiEntry index requires the field to always be an array; `savePlotItem` must
normalize `undefined` to `[]` before writing, and the array must be deduped.

### Dexie schema (`src/models/db.ts`)

Bump to `version(4)`, adding two tables and the corresponding `EntityTable` declarations:

```ts
plots!: EntityTable<Plot, "id">;
plotItems!: EntityTable<PlotItem, "id">;

this.version(4).stores({
  tomes: "id, status, updatedAt, title",
  elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
  elements:
    "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
  activities: "id, tomeId, [tomeId+occurredAt]",
  relationships:
    "id, tomeId, fromElementId, toElementId, [tomeId+fromElementTypeId+toElementTypeId]",
  plots: "id, tomeId, [tomeId+sortOrder]",
  plotItems: "id, tomeId, plotId, [plotId+sortOrder], *attachedElementIds",
});
```

Per the project's pre-release convention (as with the v3 relationships bump), no migration
path is required — a schema bump that resets local data is acceptable.

## Service/store changes (`src/services/store.ts`)

**Reads**

- `observePlots(tomeId, cb)` — live list ordered by `[tomeId+sortOrder]`.
- `observePlot(id, cb)` — the single plot, for the header/rename dialog.
- `observePlotItems(plotId, cb)` — live list ordered by `[plotId+sortOrder]`.
- `observeTomeElements(tomeId, cb)` — **already exists** (added for relationships); reused
  verbatim to resolve attachment chips and populate the attachment picker. No new query
  needed.

**Plot mutations**

- `ensureDefaultPlot(tomeId)` — returns the tome's first plot, creating
  `{ name: "Main Plot", sortOrder: 0 }` if the tome has none. Called by `PlotPage` when the
  route carries no `:plotId`.
- `savePlot(input)` — create/update; trims and requires `name`; assigns
  `sortOrder = count` for new rows, mirroring `saveType`.
- `deletePlot(id)` — transaction: delete all `plotItems` where `plotId === id`, then the
  plot, then renumber the tome's remaining plots.

**Item mutations**

- `validatePlotItem(title)` — rejects a blank `title` (the card would render headless).
  `name` and `description` are both optional.
- `savePlotItem(input, insertAt?)` — one transaction:
  - normalizes `attachedElementIds` to a deduped array,
  - for an **update**, writes the row and leaves ordering untouched,
  - for a **create**, reads the plot's current ids in order, splices the new id in at
    `insertAt` (clamped to `[0, n]`; appended when `insertAt` is undefined), then renumbers.
- `reorderPlotItems(plotId, orderedIds)` — the drag-drop commit. Verifies the submitted id
  set matches the stored set for that plot (a mismatch means a concurrent tab changed things
  — bail without writing rather than corrupting order), then assigns `sortOrder = index`
  across the list in one transaction.
- `deletePlotItem(id)` — delete, then renumber the plot's survivors.
- `setPlotItemAttachments(itemId, elementIds)` — convenience used by the dialog's attachment
  picker if it saves independently of the main form; otherwise attachments ride along in
  `savePlotItem`.

**Cascade extensions to existing methods**

- `deleteTome(id)` — also delete `db.plotItems.where("tomeId").equals(id)` and
  `db.plots.where("tomeId").equals(id)` inside its existing transaction.
- `deleteElement(id)` — after deleting relationships, strip the id from every item that
  references it, via the multiEntry index:

  ```ts
  await db.plotItems
    .where("attachedElementIds").equals(id)
    .modify((item) => {
      item.attachedElementIds = item.attachedElementIds.filter((x) => x !== id);
      item.updatedAt = now();
    });
  ```

- `deleteType(type)` — the element ids being deleted are already collected in that method;
  run the same `attachedElementIds` strip for each of them inside the existing transaction.

Attachment integrity is therefore maintained at delete time, but the render path still
filters out ids that resolve to no element, so a stale id from an interrupted transaction
degrades to "not shown" rather than a crash.

## Components

### `src/components/TimelineCard.tsx`

The encapsulated item, and the piece most of this feature's polish lives in. It **returns a
MUI `TimelineItem`** rather than wrapping one in a `Box` — MUI distributes the timeline's
`position` through React context, not by cloning children, so a custom component that
renders a `TimelineItem` as its root participates in alignment correctly; an intervening
`<div>` would break the layout grid.

```tsx
interface TimelineCardProps {
  item: PlotItem;
  attachments: Element[];        // resolved by the page, not fetched here
  types: ElementType[];
  onOpen: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  isFirst: boolean;
  isLast: boolean;
}
```

Internally it renders, top to bottom:

- `TimelineOppositeContent` — `item.name`, `variant="body2"`, `color: "text.secondary"`,
  `m: "auto 0"` (matching the wireframe).
- `TimelineSeparator` containing `<TimelineConnectorInsert>` (above), `<TimelineDot>`
  (`color={item.dotColor ?? "grey"}`, `variant={item.dotVariant ?? "filled"}`, wrapping
  `<ElementTypeIcon icon={item.icon} />` when an icon is set, empty otherwise), and a
  second `<TimelineConnectorInsert>` (below).
- `TimelineContent` — a `Card variant="outlined"` that is the click target for `onOpen`,
  holding the drag handle, `title` (`Typography variant="h6"`), `description`, and the
  attachment `Chip` row.

Attachment chips use `<ElementTypeIcon icon={type.icon} />` as the chip avatar and the
element name as the label, so a beat reads at a glance. Chip clicks navigate to that
element's editor and call `stopPropagation()` so they don't also open the item dialog.

Drag handle: `DragIndicatorIcon` inside an `IconButton` that spreads dnd-kit's
`attributes`/`listeners`, with `aria-label="Reorder item"`. It is dimmed until the card is
hovered or the handle is focused, so the timeline stays clean while remaining
keyboard-reachable.

### `src/components/TimelineConnectorInsert.tsx`

A `TimelineConnector` wrapped in a relatively-positioned `Box` with a hover/focus-revealed
`<IconButton size="small"><AddIcon/></IconButton>` centered over it, `aria-label="Insert
item here"`.

The gap between item *i* and item *i+1* is physically made of two stacked connectors —
item *i*'s bottom one and item *i+1*'s top one. Both map to the **same** insert index
(*i+1*), so the entire visual gap behaves as one target no matter which half is clicked.
The first item's top connector inserts at `0`; the last item's bottom connector appends.

The connector is also given `sx={{ minHeight: 44 }}` so the hit target is reachable on
touch even between two short cards.

### `src/components/PlotItemDialog.tsx`

Route-driven MUI `Dialog` (`maxWidth="sm"`, `fullWidth`), following `TomeFormDialog`'s
shape. Fields:

- `name` — "Spine label", helper text "Shown beside the track, e.g. Chapter 1".
- `title` — required.
- `description` — `multiline`, `minRows={3}`.
- **Icon** — a picker over `elementTypeIconOptions` plus a "No icon" choice, matching the
  existing picker in `ElementTypesPage`.
- **Dot color** — a row of `ToggleButton`s, each a small filled circle in the
  corresponding theme color, plus a filled/outlined toggle for `dotVariant`.
- **Attachments** — `Autocomplete multiple` over `observeTomeElements(tome.id)`, options
  grouped by element type (`groupBy`), rendering selected values as `Chip`s with the type
  icon. Free text is disabled — an attachment must be an existing element. There is no
  label field, by design: this is the whole difference from a `Relationship`.

Actions: **Delete** (left, `color="error"`, routed through `useConfirm()`), **Cancel**, and
**Save**. Errors surface in the existing `Alert severity="error"` pattern.

### `src/components/PlotPicker.tsx` *(small)*

The header control for switching between a tome's plots: MUI `Tabs` when a tome has a
handful, with "＋ New plot" as the trailing action, plus rename/delete on the current plot.
Extracted so `PlotPage` doesn't accumulate it inline.

### `src/components/SideNav.tsx` *(edit)*

Add a `<NavLabel>PLOTS</NavLabel>` section listing the tome's plots by name (`TimelineIcon`
from `@mui/icons-material`), each linking to `/tomes/:tomeId/plots/:plotId`, placed between
the "Overview" item and the "ELEMENTS" section — outlining is a peer of the element library,
not a child of it.

### Icons

Reuse `ElementTypeIcon` and its exported `elementTypeIconOptions` rather than standing up a
second icon registry — it already maps a string key to an icon component with a sensible
fallback, and the storage contract (`icon?: string`) is identical. The curated set is
currently world-building-flavoured; extend it with a few beat-shaped entries the wireframe
implies (`Repeat`, `Favorite`, `Warning`, `Bolt` — the last already present). The
component's name becomes a slight misnomer once plots use it; renaming it to a neutral
`AppIcon` is a reasonable follow-up but is deliberately **out of scope** here, since it
touches every current caller for no behavioural gain.

## Page: `src/pages/PlotPage.tsx`

### Routes (`src/App.tsx`, inside the `/tomes/:tomeId` layout route)

```tsx
<Route path="plots" element={<PlotPage />} />
<Route path="plots/:plotId" element={<PlotPage />} />
<Route path="plots/:plotId/items/:itemId" element={<PlotPage />} />
<Route path="plots/:plotId/insert/:index" element={<PlotPage creating />} />
```

- `/plots` with no id resolves via `ensureDefaultPlot` and `<Navigate replace>`s to the
  resulting plot, so the nav entry always lands somewhere real.
- `/items/:itemId` renders the timeline with the dialog open on that item.
- `/insert/:index` renders the timeline with the dialog open on a **new** item that will be
  spliced in at `index` when saved. Index in the path rather than a search param keeps it
  consistent with the app's existing all-path routing.

### Composition

```
PlotPage
├── header: overline + tome/plot name + PlotPicker
├── DndContext (sensors: Pointer + Keyboard, restrictToVerticalAxis)
│   └── SortableContext (verticalListSortingStrategy, items = orderedIds)
│       └── <Timeline position="right" sx={{ oppositeContent flex: 0.2 }}>
│           └── TimelineCard × n  (each wrapped by useSortable)
├── EmptyState when the plot has no items ("Start your outline")
└── PlotItemDialog (open when :itemId or :index is present)
```

`TimelineOppositeContent` defaults to taking half the row; constrain it so the spine label
column stays narrow and the cards get the space, matching the wireframe:

```tsx
sx={{ [`& .${timelineOppositeContentClasses.root}`]: { flex: 0.2 } }}
```

`position="right"` is set explicitly rather than relied upon as a default. `"alternate"` is
deliberately not used — flipping sides every row makes the insert-stem affordance and the
drag target jump left and right down the page.

### Ordering state during a drag

The `liveQuery` result is the source of truth, but a drag needs an immediate local answer:

1. `orderedIds` is `useState<string[]>`, re-seeded from the live query whenever the live
   ids change *as a set* (guard on a joined key, not identity, so a re-emit that matches the
   current order doesn't stomp an in-flight drag).
2. `onDragEnd` applies dnd-kit's `arrayMove` to `orderedIds` immediately, then fires
   `store.reorderPlotItems(plotId, next)` without awaiting.
3. The renumber is deterministic, so the live query echoes back the same order and step 1
   is a no-op.

Cards are rendered by mapping `orderedIds` through a `Map<id, PlotItem>` built from the live
query, skipping ids that no longer resolve.

### Attachment resolution

The page holds `observeTomeElements(tome.id)` once and passes each card only its own
resolved `Element[]`, rather than every card fetching for itself. `types` comes from
`useTomeWorkspace()`, already in context.

## Validation & edge cases

- **Blank title** blocks save; `name` and `description` may both be empty.
- **A plot with zero items** shows `EmptyState` with a single "Add first item" button
  (there are no stems to click when there are no items).
- **Deleting the last remaining plot** is allowed; the page then re-runs `ensureDefaultPlot`
  and lands on a fresh "Main Plot".
- **Deleting an attached element** strips it from every item (multiEntry cascade); the card
  simply shows one fewer chip.
- **An element may be attached to many items, and an item to many elements** — no
  uniqueness constraint beyond deduping within a single item.
- **Attachments never appear in an element's Relationships section**, and creating one never
  writes a `Relationship` row. If a "beats this character appears in" view is wanted on the
  element editor later, it reads from the `*attachedElementIds` index — a separate feature,
  not part of this plan.
- **Concurrent tabs**: `reorderPlotItems` bails when the submitted id set doesn't match
  storage, so a reorder racing an insert from another tab is dropped rather than applied to
  a stale list. The dropped reorder is visible immediately (the live query re-seeds).
- **`dotColor: "secondary"`** currently resolves to MUI's default purple, which clashes with
  the warm brand palette — `theme.ts` defines `primary`, `error`, `warning`, and `success`
  but no `secondary`. Add a warm `secondary` to both `lightPalette` and `darkPalette` in
  `src/theme.ts` as part of this work, or drop `"secondary"` from the offered dot colors.
  Adding it is preferred: the wireframe uses a secondary-colored dot and connector, and one
  more palette entry is cheaper than a narrower picker.

## Implementation sequence

1. **Dependencies** — install `@mui/lab` and the three `@dnd-kit` packages; add the warm
   `secondary` palette entry to `src/theme.ts`.
2. **Data layer** — `src/models/Plot.ts`; `db.ts` `version(4)` with `plots` and `plotItems`
   (including the `*attachedElementIds` multiEntry index).
3. **Store** — the observe/save/delete/reorder methods above, plus the `deleteTome`,
   `deleteElement`, and `deleteType` cascade extensions.
4. **Static render** — `TimelineCard` + `PlotPage` rendering a read-only timeline from
   seeded data; confirm it matches `wireframes/timeline_example.png` (spine labels, dot
   colors, icon dots, opposite-content width).
5. **Editing** — `PlotItemDialog` wired to the `:itemId` route: edit, save, delete.
6. **Insertion** — `TimelineConnectorInsert` + the `insert/:index` route and the splice path
   in `savePlotItem`.
7. **Attachments** — the multi-`Autocomplete` in the dialog and the chip row on the card,
   plus the element/type delete cascades.
8. **Drag and drop** — `DndContext`/`SortableContext`, the drag handle, `reorderPlotItems`,
   and keyboard reordering.
9. **Multiple plots** — `PlotPicker`, create/rename/delete, `ensureDefaultPlot`, and the
   `SideNav` PLOTS section.
10. **Docs** — update `src/components/AGENTS.md`'s "Current components" list with
    `TimelineCard`, `TimelineConnectorInsert`, `PlotItemDialog`, and `PlotPicker`, and note
    the `Plot`-record / `Timeline`-rendering naming split.
11. **Verification** — see below.

## Verification

Manual, against `npm run dev`:

- Create a tome, open **Plots → Main Plot**, add four items reproducing the wireframe
  (spine labels "Chapter 1"–"Chapter 4", the four titles/descriptions, one grey dot, one
  filled primary, one outlined primary, one secondary) and compare against
  `wireframes/timeline_example.png`.
- Click the stem above item 1 → new item lands first. Click the stem between items 2 and 3
  from **both** halves of the gap → both land at index 2. Click the stem below the last
  item → appends.
- Cancel the dialog opened from a stem → no empty item is left behind.
- Drag item 4 to position 1 with the handle; reload → order persists. Repeat using the
  keyboard (tab to handle, space, arrows, space).
- Verify a card click opens the editor and a handle drag does not.
- Attach three elements of different types to one item; confirm chips render with the right
  type icons and that clicking a chip navigates to that element.
- Delete an attached element, then an entire element type → the chips disappear from the
  timeline and no orphan ids remain (`db.plotItems.toArray()` in the console).
- Create a second plot, move between them via the picker and the side nav, delete one,
  delete the tome → no orphan `plots`/`plotItems` rows remain.
- Check the timeline in both light and dark mode and at the `sm` breakpoint.

## Acceptance criteria

- A tome supports any number of named plots; opening the plot tool on a tome with none
  creates "Main Plot" automatically.
- An item has a spine name, a title, a description, an optional icon, and an optional dot
  color/variant, and renders through a single `TimelineCard` component.
- Item order is authored and stable across reloads.
- Clicking the connector stem between two items inserts a new item at exactly that position;
  the stems at either end insert first and last respectively.
- Dragging an item by its handle reorders the plot, and the same reorder is reachable by
  keyboard.
- Clicking a card opens a dialog that edits every field and attaches any number of elements
  from the same tome, with no label or description on the attachment.
- Attachments are not `Relationship` records and do not appear in any element's
  Relationships section.
- Deleting an element, an element type, a plot, or a tome leaves no orphaned plot items or
  dangling attachment ids.
- No file in the codebase imports `@mui/lab`'s `TimelineItem` under an alias — the name is
  unclaimed by the domain model.
