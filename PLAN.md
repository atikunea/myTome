# Element relationships implementation plan

## Feature summary

Elements can be related to any number of other elements, within the same tome, regardless of element type (including two elements of the same type, e.g. Character-to-Character). Each relationship carries a single free-text label describing it (e.g. "sister of", "lives in", "sworn enemy of"). A relationship is shown identically on both elements it connects — creating "Ada [sister of] Grace" from Ada's editor makes the same "sister of" entry appear in Grace's relationship list too, and either side can edit its label or remove it. While typing a label, the field autocompletes from labels previously used for the same *from element type → to element type* pair, so once an author has typed "lives in" for a Character→Place relationship, later Character→Place relationships suggest it.

This is a native capability of every Element — not an author-configurable field on `ElementType` (unlike `FieldDefinition`'s `text`/`select` kinds). Every element gets a Relationships section in its editor regardless of how its type is configured.

## Confirmed decisions

- **Display**: symmetric same-label display. One relationship record is visible and editable from both connected elements.
- **Target scope**: any element in the tome, any type, including same-type and (not disallowed) self-relationships are simply not specially blocked by scope — see validation below for the one exception (no relating an element to itself).
- **Deletion**: cascades silently. Deleting an element, an element type (which cascades its elements), or a tome removes every relationship that referenced the deleted element(s) as part of the same transaction — no separate confirmation copy needed beyond what already exists for those deletes.
- **Autocomplete scope**: per tome. Suggestions are built only from relationships that exist within the current tome.

## Data model

Add a new top-level record, `Relationship`, alongside `Tome`/`ElementType`/`Element`:

```ts
// src/models/Relationship.ts
export interface Relationship {
  id: string;
  tomeId: string;
  fromElementId: string;
  fromElementTypeId: string; // denormalized at creation time, for autocomplete queries
  toElementId: string;
  toElementTypeId: string;   // denormalized at creation time
  label: string;
  createdAt: string;
  updatedAt: string;
}
```

`fromElementId`/`toElementId` are directional only for storage/authorship purposes (which side's editor created the row, and which type-pair its autocomplete draws from). Display treats both ends symmetrically: an element's Relationships section lists every `Relationship` where it appears as either `fromElementId` or `toElementId`.

An element type is never reassigned after creation in this app, so the denormalized `fromElementTypeId`/`toElementTypeId` values stay correct for the life of the relationship without a sync step.

### Dexie schema (`src/models/db.ts`)

Bump to `version(3)` and add a `relationships` table:

```ts
this.version(3).stores({
  tomes: "id, status, updatedAt, title",
  elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
  elements:
    "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
  activities: "id, tomeId, [tomeId+occurredAt]",
  relationships:
    "id, tomeId, fromElementId, toElementId, [tomeId+fromElementTypeId+toElementTypeId]",
});
relationships!: EntityTable<Relationship, "id">;
```

Per the existing project convention (see `PLAN.md` history / `AGENTS.md`), v1 is still pre-release: no migration path is required, a schema bump that resets local data is acceptable.

The compound index `[tomeId+fromElementTypeId+toElementTypeId]` powers the per-tome, per-type-pair autocomplete query directly, without a scan.

## Service/store changes (`src/services/store.ts`)

- `observeElementRelationships(tomeId, elementId, callback)` — live query returning every `Relationship` where `fromElementId === elementId || toElementId === elementId` for the given tome, newest-updated first.
- `observeTomeElements(tomeId, callback)` — a new tome-wide (not type-scoped) live query over `db.elements`, needed so the relationship target picker can search/display elements across all types in the tome, and so a relationship row can resolve the "other" element's current name/type for display. (`observeElements` today is type-scoped and insufficient for this.)
- `suggestRelationshipLabels(tomeId, fromElementTypeId, toElementTypeId)` — queries `relationships` by `[tomeId+fromElementTypeId+toElementTypeId]`, returns the distinct labels (case-preserved, deduped case-insensitively), most-recently-used first, for use as `Autocomplete` options.
- `validateRelationship(fromElementId, toElementId, label)` — rejects a blank label and rejects `fromElementId === toElementId` (no self-relationships).
- `saveElementRelationships(element, rows)` — given the just-saved `element` and the editor's current in-memory relationship rows (`{ id?: string; toElementId: string; label: string }[]`), runs one Dexie transaction that:
  - deletes any existing `Relationship` owned by this editor session's diff (rows removed by the author),
  - updates the `label`/`updatedAt` of rows that changed,
  - inserts new `Relationship` records for rows without an `id`, filling `fromElementId`/`fromElementTypeId` from `element` and `toElementId`/`toElementTypeId` from the picked target.

  This only manages rows *authored from this element's side* (`fromElementId === element.id`). Rows where this element is `toElementId` (created from the other side) are rendered read-only-as-a-set-membership but their label remains editable and removable too — editing/removing one of those updates/deletes that `Relationship` row directly (it doesn't matter which side "owns" it once it exists; both sides can edit/remove).
- Extend `deleteElement(id)` to run inside a transaction that also deletes every `Relationship` where `fromElementId === id || toElementId === id`.
- Extend `deleteType(type)` to also delete every `Relationship` touching any element being deleted with that type (collect the element ids first, then delete matching relationships, inside the existing transaction).
- Extend `deleteTome(id)` to also delete `db.relationships.where("tomeId").equals(id)` inside its existing transaction.

## UI changes

### Relationship editor section (in `ElementListPage.tsx`'s create/edit form)

Add a "Relationships" `Stack` after the existing field-definition inputs, before the image inputs (or after — cosmetic). Each relationship row renders:

- An MUI `Autocomplete` for the **target element**, options sourced from `observeTomeElements`, excluding the element currently being edited, labelled by `"{name} ({elementType.name})"`. Free text entry is disabled — target must be an existing element.
- An MUI `Autocomplete` (freeSolo) for the **label**, options from `suggestRelationshipLabels(tomeId, thisElement.elementTypeId, target.elementTypeId)`, re-queried whenever the selected target's type changes. `freeSolo` lets the author type any new string.
- A remove (✕) `IconButton`.

An "Add relationship" `Button` appends a new empty row. Rows are local component state (`useState<RelationshipRow[]>`), seeded from `observeElementRelationships` when editing an existing element (empty for a brand-new element, since relationships require a persisted target but not necessarily a persisted source — see below).

On submit, after `store.saveElement(...)` resolves (so a brand-new element has an `id`), call `store.saveElementRelationships(savedElement, rows)`. This lets an author add relationships while creating a brand-new element in one form submission, matching how image/attribute fields already work.

Validation: block submit (surface via the existing `error` `Alert`) if any row has a target but a blank label, or a label but no target, or targets the element itself (guards against a stale self-reference if the element is mid-creation).

### Display

Each row, once it has both a target and label, also shows the target's element-type name as secondary text (e.g. "Grace — Character") so relationships to same-named-but-different-type elements aren't ambiguous.

No separate read-only "view" page exists in this app today (the edit form doubles as the detail view), so relationships are only ever seen/managed from that form — no additional page is needed.

## Validation & edge cases

- A relationship cannot target the element itself.
- The same two elements may have multiple relationships between them with different labels (e.g. "friend of" and "business partner of" simultaneously) — not deduplicated.
- Renaming an element does not affect any `Relationship` record (only `fromElementId`/`toElementId` are stored, names are resolved live via `observeTomeElements`).
- If a target element is deleted while another author's tab has it open in a relationship row, the stale row simply disappears from both live-query-driven views once the cascade delete completes.
- Autocomplete suggestions never include the current in-progress (unsaved) row's own label.

## Implementation sequence

1. **Data layer**: add `src/models/Relationship.ts`, extend `db.ts` with the `relationships` table and version bump.
2. **Store**: implement `observeElementRelationships`, `observeTomeElements`, `suggestRelationshipLabels`, `validateRelationship`, `saveElementRelationships`; extend `deleteElement`, `deleteType`, `deleteTome` cascades.
3. **Editor UI**: add the Relationships section to `ElementListPage.tsx`'s form (target picker, label autocomplete, add/remove rows, submit-time save and validation).
4. **Display polish**: secondary element-type text on each row; confirm empty state ("No relationships yet") when a saved element has none.
5. **Verification**: manually create relationships between elements of the same type and different types across a tome; confirm autocomplete suggestions are scoped correctly per type-pair and per tome; confirm cascade deletes (delete an element, an element type, and a tome) each remove the expected relationships; confirm reload persistence.

## Acceptance criteria

- From any element's editor, an author can add any number of relationships to other elements in the same tome (any type), each with a free-text label.
- Typing a label suggests previously used labels for the same source-type → target-type pair within the current tome, and accepts any new text.
- A relationship appears identically in both connected elements' Relationship sections and is editable/removable from either side.
- Deleting an element, an element type, or a tome removes all relationships that referenced the deleted element(s); no orphaned `Relationship` records remain.
- An element cannot be related to itself.
- Relationships persist across reload (IndexedDB-backed, live-query-driven like the rest of the app).
