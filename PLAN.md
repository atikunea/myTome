# Write feature implementation plan

> Supersedes the completed "Story plotting implementation plan" (shipped in
> `92b236b`, follow-up fix `cd2f067`).

## Feature summary

A tome gains a **Write** section: a place to hold any amount of free-form
prose — **Snippets**, **Lore**, **Passages**, and **Chapters** — all backed by
one record type, `WriteItem`. Every `WriteItem` has a `title`, a fixed
`type`, timestamps, and rich text authored in a [lexical.dev](https://lexical.dev)
editor.

The **Write list page** shows every `WriteItem` in a tome as small,
title-only cards in a single grid, filterable by type and sortable by most
recent, alphabetical, or **story order**. Hovering a card for 250ms opens a
popover with a plain-text sample of the content. Clicking a card — or "+
New" — opens a **full-page editor**: an editable title at the top and a
Lexical editor filling the rest of the page. Typing `@` plus letters opens an
autocomplete over every `Element` in the tome; picking one inserts an inline
mention that links to that element. The editor **autosaves** on a debounce;
there is no explicit Save button.

**A `PlotItem` (beat) composes an ordered sequence of `WriteItem`s** — e.g. a
beat for "Chapter 3" might hold a starting snippet, two passages, and the
chapter text itself, in an author-chosen order. This is not a plain
attachment: order is meaningful (it *is* the manuscript order for that beat),
it's reorderable independent of the beat's own position on the plot spine,
and a single `WriteItem` may be composed into more than one beat (e.g. a
reusable lore snippet). New `WriteItem`s can be created directly from a
`PlotItem` and are automatically appended to its composition.

## Naming

The record is `WriteItem` — mirroring the `Plot`/`PlotItem` convention (record
+ `Item` suffix) with no collision risk (no dependency exports a `WriteItem`,
unlike the `Plot`/`Timeline` situation). `type` is a closed union
(`WriteItemType`), not a user-defined `ElementType`-style registry — the four
kinds are fixed product vocabulary, not something authors extend per tome.

## Confirmed decisions

- **Autosave, no Save button.** The editor debounces (title, type, and
  Lexical content) straight to `store.saveWriteItem`, matching a
  Google-Docs-style writing experience rather than the app's usual
  Dialog-with-Save pattern. A Delete action still exists, routed through
  `useConfirm()`.
- **Single grid + type filter**, not grouped sections or tabs. "Organizes by
  type" is one of the sort/filter toolbar controls, alongside most-recent,
  alphabetical, and story-order — not a fixed page layout.
- **Composition, not a flat attachment.** `PlotItem` gets an ordered
  `writeItemIds: string[]` — order is the manuscript order for that beat,
  reorderable via `@dnd-kit` inside `PlotItemDialog`. A `WriteItem` may appear
  in more than one `PlotItem`'s list (many-to-many), each with its own
  independent order.
- **"Story order" sort** places each `WriteItem` at its *first* composing
  beat's position (that beat's `Plot.sortOrder`, then the item's index within
  that beat's `writeItemIds`); items composed into no beat sink to the bottom,
  ordered by `updatedAt` descending within that bucket.
- **Empty drafts are silently discarded.** Opening "+ New" creates a real row
  immediately (so autosave has somewhere to write and the URL is a real id
  from the start), but if the user navigates away having never changed the
  default title or typed any content, that row — and its entry in a
  composing `PlotItem.writeItemIds`, if created from one — is deleted. This
  mirrors the existing "a cancelled `PlotItemDialog` leaves no orphan" rule,
  adapted for autosave instead of an explicit Cancel.
- **Mentions are one-directional and not cascade-maintained.** A mention node
  stores a denormalized element `id` + `name`; if that element is later
  deleted, the mention becomes a dead link on click rather than being
  scrubbed from every document's Lexical content. Scrubbing is out of scope —
  documented as a known limitation, not silently "fixed" with a background
  pass.

## New dependencies

```bash
npm install lexical @lexical/react @lexical/rich-text @lexical/list @lexical/link @lexical/utils @lexical/selection @lexical/history
```

No other editor library exists in the app today (confirmed: `package.json`
has no `lexical`, `slate`, `quill`, `tiptap`, etc.). The mention typeahead
uses `LexicalTypeaheadMenuPlugin` from `@lexical/react`, following the
pattern from Lexical's own playground `MentionsPlugin`/`MentionNode` example,
adapted to query `store.observeTomeElements` instead of a static contact
list.

## Data model

### `src/models/WriteItem.ts`

```ts
export type WriteItemType = "snippet" | "lore" | "passage" | "chapter";

export const writeItemTypes: WriteItemType[] = [
  "snippet",
  "lore",
  "passage",
  "chapter",
];

export const writeItemTypeLabels: Record<WriteItemType, string> = {
  snippet: "Snippet",
  lore: "Lore",
  passage: "Passage",
  chapter: "Chapter",
};

export interface WriteItem {
  id: string;
  tomeId: string;
  title: string;
  type: WriteItemType;
  content: string;   // JSON.stringify(editorState) — Lexical's serialized document
  preview: string;    // plain-text excerpt (~200 chars), recomputed every save; powers hover preview + avoids parsing Lexical JSON on hover
  createdAt: string;
  updatedAt: string;
}
```

`content` starts as the JSON of an empty Lexical paragraph, not `""`, so the
editor always has something well-formed to parse on load.

### `PlotItem` gains a composition field (`src/models/Plot.ts`)

```ts
export interface PlotItem {
  // ...existing fields unchanged...
  writeItemIds: string[]; // ordered: this beat's composed manuscript text, always an array
}
```

Same "always an array, never `undefined`" contract as `attachedElementIds`,
for the same Dexie `multiEntry` reason below. Unlike `attachedElementIds`,
order is meaningful and must be preserved exactly as authored — no dedupe
beyond preventing the same id twice *within one beat's own list* (nothing
stops the same id appearing in a different beat's list).

### Dexie schema (`src/models/db.ts`), bump to `version(5)`

```ts
writeItems!: EntityTable<WriteItem, "id">;

this.version(5).stores({
  tomes: "id, status, updatedAt, title",
  elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
  elements:
    "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
  activities: "id, tomeId, [tomeId+occurredAt]",
  relationships:
    "id, tomeId, fromElementId, toElementId, [tomeId+fromElementTypeId+toElementTypeId]",
  plots: "id, tomeId, [tomeId+sortOrder]",
  plotItems:
    "id, tomeId, plotId, [plotId+sortOrder], *attachedElementIds, *writeItemIds",
  writeItems: "id, tomeId, [tomeId+type], [tomeId+updatedAt], title",
});
```

The new `*writeItemIds` multiEntry index answers "which beats compose this
`WriteItem`?" as an indexed lookup — needed for the story-order sort, the
"used in ..." badge on the editor/card, and the delete cascade. Per the
project's pre-release convention (as with prior version bumps), no migration
path is required.

## Service/store changes (`src/services/store.ts`)

**Reads**

- `observeWriteItems(tomeId, cb)` — live list for the Write page; sorting
  (recent/alphabetical/story-order) and type-filtering happen client-side in
  the page, same as `ElementListPage` does for its own list.
- `observeWriteItem(id, cb)` — the single item, for the editor.
- `getComposingPlotItems(writeItemId)` — one-shot query via
  `db.plotItems.where("writeItemIds").equals(id).toArray()`, used to compute
  story-order sort keys and the "used in ..." badge. Not a live subscription
  (the Write list already re-renders on its own `observeWriteItems` tick;
  this is read once per sort pass).

**Mutations**

- `createDraftWriteItem(tomeId, type, plotItemId?)` — one transaction: inserts
  `{ title: "Untitled", type, content: <empty doc JSON>, preview: "" }`, and
  if `plotItemId` is given, appends the new id to that `PlotItem`'s
  `writeItemIds`. Returns the new id; the editor route navigates
  (`replace: true`) to it immediately so the URL always names a real row.
- `saveWriteItem(input: { id, title, type, content, preview })` — the
  autosave target; updates the row and `updatedAt`. No blocking validation —
  a blank title is allowed to persist mid-typing (the list falls back to
  "Untitled" for display).
- `discardIfEmpty(id)` — called when the editor unmounts. Deletes the row
  only if `title === "Untitled"` and `content` still deserializes to an empty
  document; if it was composed into a `PlotItem` at creation, also strips it
  from that beat's `writeItemIds` in the same transaction.
- `deleteWriteItem(id)` — transaction: delete the row, then strip the id from
  every `PlotItem.writeItemIds` via the multiEntry index (mirrors
  `deleteElement`'s existing `attachedElementIds` cascade):
  ```ts
  await db.plotItems
    .where("writeItemIds").equals(id)
    .modify((item) => {
      item.writeItemIds = item.writeItemIds.filter((x) => x !== id);
      item.updatedAt = now();
    });
  ```
- `setPlotItemWriteItems(plotItemId, orderedIds)` — the reorder/add/remove
  commit from `PlotItemDialog`'s composition list: validates every id exists
  in `tomeId`'s `writeItems`, then
  `db.plotItems.update(plotItemId, { writeItemIds: orderedIds, updatedAt: now() })`.
  Unlike `reorderPlotItems`, this is a single-row write (no renumbering
  across siblings needed — order lives entirely inside the one array field).

**Cascade extensions to existing methods**

- `deleteTome(id)` — also delete `db.writeItems.where("tomeId").equals(id)`
  inside its existing transaction.
- `deletePlotItem(id)` / `deletePlot(id)` — **no change needed.** Deleting a
  beat removes the row holding `writeItemIds`, which is sufficient; the
  `WriteItem`s themselves are independent tome-level content and are not
  deleted — they simply become composed into one fewer (or zero) beats.

## Components

### `src/pages/WriteListPage.tsx`

- Header: overline "WRITE" + a toolbar with a type filter (`ToggleButtonGroup`
  or `Select`: All / Snippet / Lore / Passage / Chapter) and a sort `Select`
  (Most recent / Story order / Alphabetical), following `ElementListPage`'s
  existing toolbar layout.
- "+ New" is a split button/menu offering the four types (each calls
  `store.createDraftWriteItem(tomeId, type)` and navigates to the editor).
- `Grid` of `WriteItemCard`, `EmptyState` when the tome has none.

### `src/components/WriteItemCard.tsx`

Small `Card variant="outlined"`, title-only face (no type badge on the card
itself — type is a filter dimension, not shown per the spec's "only displays
the title"). Owns its own hover-preview behavior: `onMouseEnter` starts a
250ms timer; on fire, opens an MUI `Popover` anchored to the card showing
`item.preview` (plain text, a few lines, `variant="body2"`); `onMouseLeave`
clears the timer / closes immediately if not yet shown. This keeps the
debounce entirely local to the card, matching how `TimelineCard` is
self-contained.

### `src/pages/WriteEditorPage.tsx`

Full-page (no `Dialog` — spec calls for a dedicated page). On the `/new`
route, an effect calls `createDraftWriteItem` once on mount and
`navigate(..., { replace: true })`s to the resulting `/write/:id`, so refresh
and back-button behave sanely and a draft is never created twice.

- Top bar: back link to `/write`, editable `title` (`TextField
  variant="standard"`, large `Typography`-scale font per the spec), a small
  `type` `Select` next to it, Delete (`useConfirm()`) on the right.
- Body: `LexicalComposer` (`RichTextPlugin` + `HistoryPlugin` + `ListPlugin` +
  `LinkPlugin` + the new `MentionsPlugin`) filling remaining page height.
- A single debounced `onChange` (title, type, and Lexical `editorState`
  together) calls `store.saveWriteItem`, recomputing `preview` via
  `$getRoot().getTextContent()` truncated to ~200 chars.
- Cleanup effect on unmount calls `store.discardIfEmpty(id)`.

### `src/lexical/MentionNode.ts` *(new folder for Lexical-specific pieces)*

A `TextNode` subclass storing `{ elementId, elementName }`, styled as an
inline link (theme `primary.main`, underline) via `createDOM`. Implements
`exportJSON`/`importJSON`/`static importDOM` so `content` round-trips through
`JSON.stringify(editorState)`/`editorState.parse(...)`. Click navigates to
that element's existing edit route
(`/tomes/:tomeId/elements/:typeId/:elementId/edit`) resolved by looking up
the element's `elementTypeId`; a since-deleted element renders the mention
inert (no crash, no navigation) rather than being scrubbed proactively.

### `src/lexical/MentionsPlugin.tsx`

`LexicalTypeaheadMenuPlugin` triggered on `@` + word characters. Queries
`store.observeTomeElements(tomeId)` (already exists, reused verbatim per the
`Plot` feature's precedent), filters by name prefix, groups by `ElementType`
the same way `PlotItemDialog`'s attachment `Autocomplete` does. Selecting an
option inserts a `MentionNode`.

### `src/components/PlotItemDialog.tsx` *(edit)*

New "Composed text" section, below the existing element-attachment picker:
an ordered, `@dnd-kit`-sortable list of the beat's `writeItemIds` (title +
`ElementTypeIcon`-style type icon), each row clickable to open that
`WriteItem` in the full editor (navigating out of the dialog — acceptable,
since the editor is a dedicated page). A trailing row offers "+ Add
existing" (`Autocomplete` over the tome's `writeItems` not already
composed here) and "+ New" (a small type menu, calling
`createDraftWriteItem(tomeId, type, plotItemId)` then navigating to the new
item's editor). Removing a row detaches it (`setPlotItemWriteItems` without
that id) without deleting the `WriteItem`.

### `src/components/SideNav.tsx` *(edit)*

Add a `<NavLabel>WRITE</NavLabel>` entry (icon: `EditNote` or similar from
`@mui/icons-material`) linking to `/tomes/:tomeId/write`, as a peer section
alongside PLOTS and ELEMENTS — not nested under either.

## Routes (`src/App.tsx`, inside the `/tomes/:tomeId` layout route)

```tsx
<Route path="write" element={<WriteListPage />} />
<Route path="write/new" element={<WriteEditorPage creating />} />
<Route path="write/:writeItemId" element={<WriteEditorPage />} />
```

`type` and an originating `plotItemId` (when created from `PlotItemDialog`)
travel as search params on the `/new` route
(`?type=chapter&plotItemId=...`), read once by the mount effect that calls
`createDraftWriteItem`.

## Validation & edge cases

- **Blank title** never blocks autosave; the list and any "used in" badges
  fall back to "Untitled" for display.
- **Deleting a `WriteItem`** strips it from every composing `PlotItem`'s
  `writeItemIds` — the beat just loses that entry, no reorder needed for the
  survivors (array splice, not a renumbered index).
- **Deleting a `PlotItem` or `Plot`** leaves every composed `WriteItem`
  intact; they become composed into one fewer beat (or zero), never deleted.
- **A `WriteItem` in zero beats** is valid and simply sorts to the bottom
  under "Story order."
- **A `WriteItem` in more than one beat** is valid (many-to-many, confirmed);
  story-order uses its earliest beat as the sort key.
- **Mentions to a deleted element** render inert rather than being
  proactively scrubbed from every document — a known, documented limitation.
- **Concurrent tabs**: last debounced write wins (plain Dexie `put`), same
  simplicity bar as the rest of the app — no operational-transform/CRDT
  merge for simultaneous edits to the same `WriteItem`.
- **Abandoned "+ New"** (opened, nothing typed, navigated away) leaves no
  orphan row and no dangling `writeItemIds` entry.

## Implementation sequence

1. **Dependencies** — install `lexical` + the `@lexical/react` and
   supporting subpackages listed above.
2. **Data layer** — `src/models/WriteItem.ts`; add `writeItemIds` to
   `PlotItem`; `db.ts` `version(5)` with the `writeItems` table and the
   `*writeItemIds` index.
3. **Store** — the observe/create/save/delete/discard methods above, plus
   the `deleteTome` cascade extension.
4. **Static render** — `WriteListPage` + `WriteItemCard` against seeded data;
   confirm the type filter, sort options, and 250ms hover-preview popover.
5. **Editor shell** — `WriteEditorPage`: title field, type select, draft
   creation on mount, Delete, discard-if-empty on unmount — no Lexical yet
   (plain `TextField` placeholder for content).
6. **Lexical wiring** — swap in `LexicalComposer` with the basic plugin set,
   debounced autosave of `title`/`type`/`content`, and `preview` derivation.
7. **Mentions** — `MentionNode` + `MentionsPlugin` (typeahead over
   `observeTomeElements`), click-through to the element's edit route.
8. **Plot integration** — `PlotItemDialog`'s "Composed text" section: list,
   `@dnd-kit` reorder, add existing, add new (per type), remove.
9. **Nav** — `SideNav` WRITE entry, routes in `App.tsx`.
10. **Docs** — update `src/components/AGENTS.md`'s "Current components" list
    with `WriteItemCard`, `MentionsPlugin`/`MentionNode`, and the
    `PlotItemDialog` composition-section addition; note the
    `WriteItem`/`PlotItem` composition relationship next to the existing
    `Plot`/`Timeline` naming note.
11. **Verification** — see below.

## Verification

Manual, against `npm run dev`:

- Create four `WriteItem`s, one of each type, with distinct titles; confirm
  the Write grid shows title-only cards and the type filter narrows correctly.
- Hover a card for under 250ms and release — no popover. Hold past 250ms —
  popover shows a text sample; move away — it closes.
- Open a new item, type a title and a paragraph, wait for the debounce,
  reload — content persists. Open "+ New," immediately navigate away without
  typing — reload the list — no "Untitled" card was left behind.
- In the editor, type `@` and a few letters of an existing element's name;
  confirm the autocomplete filters and grouping by element type; select one
  and confirm an inline link is inserted; click it and confirm navigation to
  that element's editor; reload the document and confirm the mention
  survives serialization.
- From a `PlotItem`'s dialog, add an existing `WriteItem` and create a new
  one via "+ New"; confirm both appear in "Composed text," reorder them via
  drag, reload, and confirm the order persisted.
- Sort the Write list by "Story order" with items composed into beats at
  different plot positions and some composed into none; confirm the
  attached items appear in beat order and unattached items trail at the end.
- Delete a `WriteItem` that is composed into two different beats; confirm it
  disappears from both beats' "Composed text" lists with no dangling id.
- Delete a `Plot` whose beats compose several `WriteItem`s; confirm the
  `WriteItem`s themselves still exist afterward (check the Write list).
- Delete the tome; confirm no orphan `writeItems` rows remain
  (`db.writeItems.toArray()` in the console).
- Check the Write list and editor in both light and dark mode and at the
  `sm` breakpoint.

## Acceptance criteria

- A tome supports any number of `WriteItem`s across four fixed types, each
  with a title, type, timestamps, and Lexical-authored text.
- The Write list shows title-only cards, filterable by type and sortable by
  most recent, alphabetical, and story order (a beat's position on the plot
  spine, then the item's position within that beat).
- Hovering a card for 250ms shows a text-sample popover; releasing early
  shows nothing.
- Adding or editing opens a dedicated full-page editor with an editable
  title and a Lexical rich-text body; changes autosave on a debounce with no
  explicit Save action.
- Typing `@` plus letters autocompletes over the tome's `Element`s and
  inserts a navigable inline mention, grouped by element type in the
  suggestion list.
- A `PlotItem` composes an ordered, reorderable list of any number of
  `WriteItem`s (many-to-many across beats); new items can be created
  directly from a beat and are auto-composed into it.
- Deleting a `WriteItem`, `PlotItem`, `Plot`, or tome leaves no orphaned rows
  or dangling `writeItemIds`/mention references beyond the documented
  "dead mention link" limitation.
- Abandoning a freshly opened, untouched "+ New" item leaves no trace in the
  list or in any beat's composition.
