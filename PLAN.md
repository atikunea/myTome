# myTome implementation plan

## Scope read from the wireframes

The PDF shows three core experiences:

1. **Author dashboard / tome library**: browse tomes as cards, create a tome, edit tome details, search, and filter by status.
2. **Book dashboard**: a persistent left navigation scoped to the opened tome; its **Elements** links are generated from that tome's element types.
3. **Element management**: a reusable management page for an element type (the example is Characters), with search, sort, grid/list view, card rendering, create, edit, and delete.

The annotations in the wireframes say that the author-level metric cards, recent-activity table, and book-dashboard analytics/activity/deadline panels are **v2** and must not be built in the first pass. The navigation entries beyond Dashboard and dynamic Elements (Manuscript, World Building, Timeline, Research Notes, Settings) are also deferred. Export PDF is explicitly deferred from v1.

## Current-state assessment

The repository is a Vite + Lit + TypeScript application with Dexie/IndexedDB installed. It currently renders the Vite starter component. The existing data model is a useful beginning but lacks stable timestamps, lifecycle status, images, extensible element data, activities, indexes for the planned queries, and an application/store layer. `element-type-list` also needs replacement: it does not retain fetched data, does not use Lit templates for item rendering, and does not participate in a view lifecycle.

## Proposed first-pass boundary

Deliver a polished, responsive local-first SPA that supports:

- Tome list/grid, search, filter by `Draft`/`Completed`/`Archived`, empty state, create, update, open, and permanently delete after a destructive-action warning.
- One active tome at a time, represented in the URL and restored on reload.
- Per-tome navigation containing Dashboard and the tome's dynamic ElementTypes.
- A simple tome dashboard/summary landing screen. Do not add counts, charts, activity, deadlines, or other analytics until v2.
- Full per-tome ElementType configuration: create, rename, describe, reorder, and delete types; define the fields for each type; and use that configuration to drive generic element CRUD.
- Element search, sort by recent update/name, grid/list preference, thumbnail fallback, confirmation before delete, and good empty/loading/error states.
- IndexedDB persistence, seed data only for development, and tests around repositories/store/query behavior.

## Architecture decisions

### Routing and app shell

Use a small hash router (no new dependency required) with routes:

- `#/tomes`
- `#/tomes/new` and `#/tomes/:tomeId/edit`
- `#/tomes/:tomeId/dashboard`
- `#/tomes/:tomeId/elements/:elementTypeId`
- `#/tomes/:tomeId/elements/:elementTypeId/new`
- `#/tomes/:tomeId/elements/:elementTypeId/:elementId/edit`

Add an `app-shell` root component that owns routing and renders either the author layout or the tome workspace layout. The active tome is route state, not a separate persisted global setting; this makes reload, deep links, and browser navigation deterministic.

### Data access and state

Keep components database-free. Introduce:

- `models/db.ts`: Dexie schema/version definitions, reset-and-seed utilities, and testable database factory.
- `data/*Repository.ts`: typed, query-focused CRUD methods only.
- `services/tome-service.ts` and `services/element-service.ts`: validation, mutations, and derived query composition.
- `state/app-store.ts`: a small reactive store using `EventTarget` plus immutable snapshots; it subscribes to `liveQuery` for affected Dexie queries, exposes loading/error state, and keeps only UI state (route, filters, sort, display mode, dialog state).

Lit components receive state as properties and dispatch intent events. Container/page components call the store. This provides immediate reactivity after local writes without adding Redux or another state package.

### Database model and prototype reset

Replace the prototype schema with the v1 Dexie schema and reset existing local prototype data; no compatibility migration is required. Use string UUIDs for new primary keys so a future sync feature can merge records without remapping integer IDs. Keep database versioning in place for future releases, but v1 development may safely clear and reseed the database whenever its schema changes.

Proposed persisted records:

| Record | Key fields and indexes | Purpose |
| --- | --- | --- |
| `Tome` | `id`, `title`, `subtitle?`, `description`, `coverImage?`, `status` (`Draft`/`Completed`/`Archived`), `createdAt`, `updatedAt`, `archivedAt?`; indexes: `status`, `updatedAt`, normalized title | library cards, filtering, lifecycle |
| `ElementType` | `id`, `tomeId`, `slug`, `name`, `description?`, `icon?`, `sortOrder`, `fieldDefinitions`, `createdAt`, `updatedAt`; compound index `[tomeId+sortOrder]` | dynamic navigation and author-configured form/card configuration |
| `Element` | `id`, `tomeId`, `elementTypeId`, `name`, `description`, `image?`, `attributes`, `createdAt`, `updatedAt`, `deletedAt?`; indexes: `[tomeId+elementTypeId]`, `[elementTypeId+updatedAt]`, normalized name | generic element CRUD and lists |
| `Activity` (v2-ready, not surfaced in v1) | `id`, `tomeId`, `elementId?`, `action`, `occurredAt`, `summary`; indexes: `[tomeId+occurredAt]` | future activity and streak/analytics derivations |

Images can be supplied through a local upload or an external URL. Model `coverImage` and `image` as an `ImageSource` tagged union: a local record stores a `Blob` in IndexedDB, while an external record stores a validated `https:` URL. Object URLs are UI-only, created from a stored blob and revoked when no longer displayed. Preserve both source types in the domain model so a future export feature can resolve/embed them; PDF export itself is out of scope for v1. Avoid duplicating derived values such as element count and total word count in `Tome`; compute them by query until performance evidence requires a projection table.

### ElementType field configuration (confirmed)

ElementTypes are fully configurable within their Tome. The starting types (Theme, Character, Place, Event, and Prop) are seed data only, not global or fixed definitions. An author may create a different set of types for each book, so configuration must always be queried and mutated in the context of a `tomeId`.

The configuration is a small, intentionally constrained schema for v1. Each ElementType retains a name and optional description and contains ordered field definitions:

```ts
type FieldDefinition = {
  id: string;                 // stable field key, never derived from its label
  name: string;               // author-visible label, e.g. "Gender"
  kind: 'text' | 'select';
  options?: string[];         // required and non-empty only for `select`
  required: boolean;          // author-configurable; defaults to false
  sortOrder: number;
};

type ElementType = {
  id: string;
  tomeId: string;
  slug: string;
  name: string;
  description?: string;
  fieldDefinitions: FieldDefinition[];
  // timestamps and display fields listed above
};

type Element = {
  // base fields: id, tomeId, elementTypeId, name, description, image, timestamps
  attributes: Record<string, string>;
};
```

`kind: 'text'` renders a text input (or textarea only if we extend the field kinds later). `kind: 'select'` renders a select using `options`, for example `{ name: 'Gender', kind: 'select', options: ['Male', 'Female', 'Other'] }`. The Element editor always renders the base name/description fields followed by `fieldDefinitions` in `sortOrder`; it uses the field ID to read/write `Element.attributes`, not the display name. This allows labels to be renamed without losing values.

The ElementType editor needs a field-builder UI: add a field, name it, choose Text or Configurable List, mark it required, edit/reorder list options, reorder fields, and remove a field. Validation must reject blank/duplicate field IDs or names, blank list choices, duplicate choices after normalization, a select field with no choices, and missing values for required fields. The service also validates every element write against the current field definitions.

Schema changes need explicit behavior:

- Renaming a field preserves values because its stable ID remains unchanged.
- Changing Text to Select preserves an existing value only when it is an allowed option; otherwise the element is flagged for correction rather than silently deleting data.
- Removing a field is a destructive cascade. Before enabling the action, show the field name and the count of elements with a stored value; the confirmation dialog states that those values will be permanently deleted. On confirmation, update every affected Element atomically in a Dexie transaction to remove `attributes[fieldId]`, then remove the field definition.
- Deleting an ElementType is a separately confirmed destructive cascade. Before enabling the action, show the ElementType name and total Element count, explain that all of those Elements and their image blobs will be permanently deleted, and require explicit confirmation. Run the Element deletion and ElementType deletion in one Dexie transaction; do not leave orphaned images or Elements.

For this first version, field values are single strings. A configurable list defines a single-select field, not a multi-select array. Rich text, number/date/boolean fields, relationships to other elements, computed fields, and repeatable fields are deliberately deferred until their data and UX semantics are specified.

### Reusable component composition

Create the following Lit components, composed from small presentational primitives:

- `app-shell`, `author-layout`, `tome-layout`, `side-nav`, `app-header`
- `tome-library-page`, `tome-card`, `tome-editor-dialog/page`, `library-toolbar`
- `element-type-settings-page`, `element-type-editor`, `field-definition-builder`, `field-option-editor`
- `tome-dashboard-page` (simple summary only; no analytics components in v1)
- `element-list-page`, `element-toolbar`, `element-card`, `element-row`, `element-editor`, `empty-state`, `confirm-dialog`
- shared controls: `app-button`, `app-input`, `app-select`, `icon-button`, `view-toggle`, `status-badge`

Use Web Awesome's components/icons if its current API meets the controls needed; otherwise use accessible native controls and a centralized inline SVG icon set. Establish design tokens in `src/styles/tokens.css` and shared layout/control styles rather than embedding large style blocks in every component.

## Implementation sequence

1. **Foundation**: replace the starter screen; add design tokens, reset/base styles, icon strategy, responsive breakpoints, `app-shell`, and hash routing. Define desktop sidebar behavior and a compact mobile navigation pattern.
2. **Domain/data foundation**: introduce the revised types, ElementType field-definition schema, reset-and-reseed prototype database, repositories, validators, and deterministic development seed utility. Add a data reset action only in development.
3. **Reactive state**: build the app store and `liveQuery` subscriptions; implement route parsing/guards for nonexistent tome or element-type IDs; surface friendly error/empty states.
4. **Tome library**: implement responsive card/list layout, title/status search/filter, create/edit tome form, Draft/Completed/Archived badges, local-upload or external-URL covers with fallbacks, a clearly worded permanent-delete confirmation, and open navigation.
5. **Tome workspace**: implement the tome header, dynamic sidebar derived from `ElementType`, simple summary landing screen, and navigation state. Do not implement analytics panels marked v2.
6. **ElementType settings and generic element management**: implement the type/field builder, required-field validation, confirmed transactional field-value cascade, and separately confirmed ElementType-to-Element cascade; then implement reusable querying, toolbar, grid/list preference, cards/rows, sort/search, create/edit form driven by `fieldDefinitions`, image handling, and deletion confirmation. Verify it with Character, Place, Theme, Event, and Prop seed types plus a custom type.
7. **Quality pass**: keyboard and screen-reader behavior, focus management for dialogs, form validation, responsive layouts, IndexedDB reset/reseed and persistence tests, service/repository unit tests, and an end-to-end smoke test for create tome -> create element type/element -> search/sort -> reload persistence.
8. **Deferred v2 planning**: add Activity writes to mutations, then implement history, writing streak/velocity, charts, deadlines/tasks, manuscript, timeline, research, world-building, export, cloud sync, and collaboration only after their requirements are agreed.

## Acceptance criteria for v1

- A user can create and edit a tome, select Draft/Completed/Archived status, attach/change a local or external-URL cover, find it by title, filter it by status, open it after a refresh, or permanently delete it only after a warning confirmation.
- Opening a tome builds its Elements navigation from that tome's `ElementType` records, without hardcoded Character/Place links.
- An author can create and configure ElementTypes within a tome. A field can be a required/optional free-text value or a required/optional single-select configurable list, and the generic Element editor validates and renders it correctly.
- Removing a configured field clearly describes and confirms the permanent cascade of stored values, then completes it atomically.
- Removing an ElementType clearly describes and confirms the permanent cascade of all of its Elements and image blobs, then completes it atomically.
- Any element type uses the same list/editor architecture and persists isolated to its tome/type.
- Search, sorting, grid/list rendering, empty states, and CRUD immediately refresh in every affected view.
- The application is usable at 320 px through desktop widths, has keyboard-operable controls, and preserves data across reloads.
- The v2-only wireframe annotations are not inadvertently implemented as production scope.

## Confirmed v1 platform constraints

- Persistence is browser-only IndexedDB. Accounts, sync, import/export, backup, and server APIs are out of scope for v1.
- Existing prototype data may be reset. No data migration is required before v1 implementation.
- Use hash URLs for deep links and reload-safe routing; no server fallback configuration is required.

## Risks and decisions to make before coding

- A generic `attributes` object is flexible, but must be paired with a versioned field schema and validation rules; otherwise element forms become inconsistent and difficult to migrate.
- Full-text search across arbitrary descriptions/attributes is not natively indexed by IndexedDB. V1 should filter loaded items within a tome/type; add a denormalized search index only if data size requires it.
- Writing streaks and velocity need an explicit definition of what counts as writing and immutable daily activity/word-count data. They should remain v2, as annotated.
- Client-only IndexedDB does not provide backup, multi-device sync, or recovery after browser-data deletion. Keep repository interfaces async and ID formats sync-friendly so a cloud adapter can be added later.
