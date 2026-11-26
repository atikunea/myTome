# Plot grid: edit beats where they sit

## Intent

The beat label is already typed on the card. Everything else about a beat —
title, description, dot, attached elements — still needs a trip into
`PlotItemDialog`. The author should be able to change any of it on the grid,
while looking at the beats around it.

## Goals

- Title and description edited inline on `PlotBeatCard`.
- The dot's colour, variant (filled / outlined) and icon edited from a popover
  anchored to the dot on the track.
- Elements attached to and detached from a beat on the card.

## Non-goals

- Attaching elements to a whole plot. Attachments stay per beat
  (`PlotItem.attachedElementIds`).
- Any schema, backup-format or route change.

## Anti-goals

- A second place that edits the same value and can drift: once a field is
  inline, the dialog stops offering it (the beat-label precedent).
- Controls reachable only by hover or a modifier key — they must work on touch.

## Approaches considered

1. **Inline fields + dot popover + chip picker on the card** — picked. Every
   value is edited where it is read; each change saves on its own.
2. Keep the dialog, make it faster to reach. Cheaper, but still a modal between
   the author and the grid, which is the thing being removed.
3. Click the dot to cycle colours, shift-click for variant. Undiscoverable, and
   touch has no shift key. Rejected.

## Design

### Title and description

- Both become `InlineTextField`s on the card: title single-line in the `h6`
  slot, description `multiline` with `whiteSpace: pre-line` kept.
- Each sits in a click guard (`stopPropagation`), as the beat label does.
- New store mutations, each writing one field and `updatedAt`:
  `setPlotItemTitle(itemId, title)` and `setPlotItemDescription(itemId, text)`.
- Title is required (`validatePlotItem`). An empty title is not saved: on blur
  the field restores the stored title. *(Builder's call how — e.g. the save
  rejects and the field resets to `value`.)*
- An empty description shows a hover-revealed placeholder ("Add a
  description"), using the beat label's hidden-placeholder technique, so the
  slot exists to click into without every card advertising it.

### The dot popover

- `BeatDot` becomes a real button (plain `Box component="button"`, not
  `IconButton`, for the same reason as the drag handle) with an `aria-label`
  like "Dot for {title}".
- Clicking opens an MUI `Popover` anchored to the dot containing:
  - **Colour**: seven swatches. The first is labelled **"Thread"** and drawn in
    the plot's own thread colour — `grey` means "match the thread" in
    `BeatDot`, and the dialog's `grey.400` swatch misrepresents that.
  - **Variant**: Filled / Outlined, shown as two sample dots.
  - **Icon**: a grid of `elementTypeIconOptions` plus "None".
- Every click saves immediately via one mutation,
  `setPlotItemDot(itemId, { dotColor?, dotVariant?, icon? })`. No Save button.
- The popover's state is not a route (which field is being edited stays out of
  the URL, per `AGENTS.md`).

### Attached elements

- After the beat's chips, a small **"+"** chip, always visible (touch). It opens
  a popover with the same grouped `Autocomplete` the dialog uses today —
  extracted into a shared component so the two can't drift while both exist.
- Each element chip gets an `onDelete` ✕ to detach. Clicking the chip body still
  opens the element.
- Mutation: `setPlotItemAttachments(itemId, elementIds)`.

### The card and the dialog

- Clicking the card body no longer opens the dialog — everything it edited is
  on the card. The card stops being `role="button"`.
- A **⋮** menu on the card (hover-revealed on pointer devices like the drag
  handle, always focusable) holds **Delete**, through `confirmAction`.
- `PlotItemDialog` remains the **create** form (title, description, dot,
  attachments). The `plots/:plotIds/items/:itemId` route keeps resolving so old
  links don't 404; it opens the dialog as today. *(My call: keep it rather
  than decide those links may break.)*

## Constraints

- Mutations live in `services/plots.ts`, reached through `store`; none touch
  rows, so no `syncPlotSortOrder` is needed.
- Validation stays outside mutations.
- MUI only, theme tokens, no hex.
- Each new mutation gets a test in `services/__tests__/` (write, then read the
  table). The UI is verified by running the app.

## Left to the builder

- Exact popover layout and spacing; whether the attach picker and dialog share
  one extracted component or a hook.
- Where the ⋮ sits relative to the Write button.
