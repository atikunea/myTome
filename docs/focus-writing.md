# Focus Writing — design notes

**Status: built.** Every decision below is implemented and verified in the
browser. The rejected options are kept with their reasons, so a later reader can
tell what was considered from what was overlooked.

Mockups: the design canvas published alongside this doc (Option A on the
*Write surface* page, Beat B and the swap diagram on *Beat editor*).

**Where it lives now:**

| Piece | File |
| --- | --- |
| The overlay, its chrome and the face setting | `components/FocusSurface.tsx`, `context/ProseFaceContext.tsx` |
| Sections, the swap, word count | `components/ProseManuscript.tsx` |
| The single live editor and caret placement | `components/ProseEditor.tsx` |
| Static rendering | `lexical/blocks.ts` (pure, tested), `components/StaticProse.tsx` |
| Shared typography | `components/manuscriptStyles.ts` |
| Floating / docked toolbars | `lexical/ProseToolbarPlugin.tsx` |
| Routes | `pages/WriteEditorPage.tsx`, `pages/BeatManuscriptPage.tsx` |

Two things landed differently from the plan, both noted in their sections below:
composition **reordering** is a menu rather than drag handles, and the
active-section marker is a positioned pseudo-element rather than a border.

**Mentions needed work the move to an overlay had broken.** They are unchanged
in spirit — type `@`, pick an element, get an inline `MentionNode`; click one to
open that element — but two things had to be fixed for them to work on the new
surface, both recorded in `src/components/AGENTS.md`: the typeahead menu painted
*behind* the dialog (`LexicalTypeaheadMenuPlugin` anchors to `<body>` at
`z-index: auto`), and section focus depended on an animation frame that does not
always arrive.

---

## The design, in one place

- The Write editor becomes a **focus surface**: an overlay above the workspace
  with a dimmed scrim, entered from the existing `write/:writeItemId` route.
  Below `sm` it is full-bleed instead.
- A plot beat's composed texts are drawn as **one continuous manuscript** in
  that surface, in `writeItemIds` order.
- Sections render as **static markup**. Clicking one mounts the **single**
  Lexical editor for it. At most one `LexicalComposer` and one `useAutosave`
  machine are ever alive.
- `PlotItemDialog` **stays a dialog** and gets shorter: composition moves out to
  the manuscript.

---

## Part 1 — The writing surface

### What was wrong

Structural, not cosmetic:

- **The app never got out of the way.** The editor is an `<Outlet/>` child of
  `WorkspaceLayout`, so the 238px permanently-dark `SideNav` — the highest
  contrast object on screen — sat in peripheral vision throughout.
- **No measure.** `ContentEditable` is `fullWidth` inside `main`'s
  `clamp(20px, 5vw, 76px)` padding, so a line of prose ran ~1050px / ~130
  characters on a wide monitor. Invisible on a laptop; the worst of the six.
- **Delete one click from the caret**, at the same weight as Back.
- **The brand serif went unused** where it would matter — `brandFontFamily` on
  the wordmark, Inter at `1.02rem` in the manuscript.
- **`minHeight: 360`** — a short chapter ended mid-viewport.
- **The toolbar was always on**, all 18 controls.

### Decision: Option A — overlay over the workspace, with a scrim

The route stays under `WorkspaceLayout`, so the workspace still mounts and
renders behind; the editor draws into a fixed full-viewport surface above it
with a dimmed backdrop. Closing dissolves back to the plot or list underneath.

The scrim is the point: seeing the greyed app is what makes it read as *stepping
out* rather than navigating. Deep links, back and refresh keep working with no
route surgery, satisfying `AGENTS.md`'s "routes are the dialog state" for free.

**Rejected — Option B, a full-bleed route outside `WorkspaceLayout`.** Calmer
and simplest to build, but there is nothing behind to grey out, so entry is a
hard page swap. It also leaves `TomeWorkspaceContext`, which the editor needs
for `tome` and `types` (`MentionsPlugin` requires `types`), so the provider
would have to be hoisted.

**Rejected — Option C, an in-place zen toggle.** Focus becomes a mode the author
must remember to switch on, which most never will.

### Settled surface details

| Question | Decision |
| --- | --- |
| Measure | **Fixed at ~66ch.** Not a setting: 60–75 characters is a defensible right answer and a slider invites fiddling. Because `ch` is font-relative it stays ~66 *characters* across faces. |
| Prose typeface | **Author-settable**, defaulting to `brandFontFamily`. Stored in `localStorage`, following `ColorModeContext`'s precedent — app-wide, not per tome. |
| Toolbar | **Floating on selection** on pointer devices. Nothing occupies the page while writing, and it belongs to whichever section is mounted, so it cannot cause layout shift. (Touch: see Mobile.) |
| Chrome behaviour | **Fades while typing**, returns on pointer movement. Lets `SaveStatus` stay permanently mounted without competing with the prose. |
| Destructive actions | **Both, named differently**, in a section's overflow menu: "Remove from this beat" (detach) and "Delete text permanently" (behind `confirmAction`, worded with where else the text is used). |
| Escape key | **Closes the surface**, flushing the pending autosave first — the same code the unmount path already runs, reached by a keystroke. |
| Word count | **Yes** — quiet, in the chrome, per section and for the whole beat; computed from `preview`'s text. Fades with the rest of the chrome. |
| Title | **Scrolls with the prose.** It is part of the document, and in the manuscript each section carries its own. |
| Typewriter scrolling | **Not in v1.** Interacts awkwardly with a multi-section manuscript and with mobile keyboards. |
| Current-paragraph highlight | **Not in v1.** Competes with the accent rule already marking the mounted section; the two would need reconciling first. |

---

## Part 2 — Writing a beat's text

### The seam being closed

A `PlotItem` **composes** `WriteItem`s in reading order (`writeItemIds`). Today
clicking a composed row **navigates away** from the beat's dialog to the
full-page editor, losing the beat entirely — and `createComposedText` has to
call `store.setPlotItemWriteItems(...)` before leaving, purely so an unsaved
reorder is not thrown away. That defensive save is the tell: the dialog knows it
is a dead end.

### Decision: Option B — continuous beat manuscript

Every composed `WriteItem` stitched into one scrolling column under labelled
rules, in reading order. The beat reads as continuous prose and you click into
any part of it.

Static sections render at **full contrast** — this is the manuscript, not a
preview of it. Only chrome marks the mounted one: an accent rule, a caret, the
floating toolbar. A hovered static section offers "click to edit".

**Rejected — Option A, a rail of titles in the focus surface.** The manuscript
shows the same information as prose you can actually read. Worth keeping as a
possible later *outline* affordance beside the manuscript, not instead of it.

**Rejected — Option C, leave it alone.** Leaves the dead end and the defensive
save exactly as they are.

---

## Part 2a — Lazy-mounted editor: one live editor, n static sections

Clicking a section mounts a real Lexical editor **for that section only**; the
previously mounted one flushes and reverts to static.

### Why, beyond performance

Performance was the motivation and is the *weakest* reason — four to eight
mounted editors would very likely go unnoticed. The real arguments are about
correctness:

- **`hooks/autosave.ts` and `useAutosave` do not change at all.** One machine,
  one item, one debounce — exactly the contract the suite pins down. N editors
  means N machines and a new "flush which one?" question nothing covers.
- **`SaveStatus` keeps one honest state.** With several live editors, "Saved" is
  ambiguous — saved *what*? Its whole value is that the words cannot disagree
  with what was written.
- **Toolbar, `MentionsPlugin` and `HistoryPlugin` follow focus for free**, since
  there is only one editor to follow. Otherwise a broker has to decide which
  editor owns the toolbar — exactly where selection bugs live.

So: a **correctness simplification that happens to also be faster**.

### Decision: draw static sections by walking the serialized JSON

No new dependency, and no magic numbers — `lexical` publicly exports `IS_BOLD`,
`IS_ITALIC`, `IS_UNDERLINE`, `IS_STRIKETHROUGH`, `IS_CODE`, `IS_HIGHLIGHT`,
`IS_SUBSCRIPT`, `IS_SUPERSCRIPT` and `TEXT_TYPE_TO_FORMAT`, so the `format`
bitmask is decoded against the library's own constants. The node set is closed
and ours (`initialConfig` names all of it), and mentions become real React
elements with a real `onClick` instead of a delegated `closest()` lookup.

**Split it the way `autosave.ts` / `useAutosave.ts` is split:** a pure
`lexicalToBlocks(content)` returning a plain descriptor tree — data, no React —
plus a thin component that renders descriptors. The pure half is a `.test.ts`
collected by the existing `node` environment, and every bug worth testing
(format bitmask, list nesting, `checked` state) lives in it. The root
`AGENTS.md` asks for exactly this split.

**Rejected — headless Lexical.** `createHeadlessEditor` + `$generateHtmlFromNodes`
into `dangerouslySetInnerHTML`. `@lexical/html` is already in the tree but
**`@lexical/headless` is not**, so it costs a dependency; it still builds a
Lexical instance per section; and mentions go back to `closest()` delegation on
opaque markup.

**Rejected — read-only Lexical instances** (`editable: false`, flipping the
clicked one). It would eliminate the drift risk outright by being literally the
same renderer, but it is n live instances — the thing this decision exists to
avoid.

### The detail that decides whether it feels good

1. **One shared style object.** The static block and the mounted
   `ContentEditable` must render from the *same* `sx`. That style block sits
   inline in `WriteEditorPage` today and has to come out into something both
   consume. Diverge by one `line-height` and every click makes the text jump
   under the cursor — the single failure that would make this worse than what we
   have.
2. **Caret placement.** Mounting does not put the caret where the author
   clicked. Capture the click's `clientX`/`clientY` and resolve it after mount
   with `document.caretPositionFromPoint` (`caretRangeFromPoint` on WebKit) into
   a `Range` for Lexical's selection. Landing at the block start instead is the
   cheap fallback and feels wrong mid-paragraph.
3. **Scroll anchoring.** If 1 holds, heights match and nothing moves. Keep a
   `getBoundingClientRect().top` capture as belt-and-braces.

### Ordering a section switch

`flush A` → **render A statically from `latest.current`** → unmount A → mount B
keyed by id → place the caret.

Rendering A from `latest.current` rather than re-reading the row matters: the
write and its `liveQuery` echo are not synchronous, so a re-read flashes the
pre-edit text for a frame.

### Settled consequences

| Question | Decision |
| --- | --- |
| Blank drafts | **Discarded when the surface closes**, not on editor unmount. The focus overlay becomes the new "page", so `discardWriteItemIfBlank`'s rule is unchanged — just hung off a different component, and the StrictMode deferred-tick guard moves across wholesale. A blank draft stays visible as an empty section while you are still in the beat, so you can click back into it. |
| Undo | **Per-section.** `HistoryPlugin`'s stack dies with the editor; Ctrl+Z will not cross a section boundary. Honest, given autosave has already persisted the previous section — crossing would mean undoing a written change. Accepted knowing authors do reflexively try it. |

### Still to watch

- **Reader/editor drift.** A node type added to `initialConfig` and not to
  `lexicalToBlocks` renders as nothing. Needs a deliberate fallback and a line in
  `AGENTS.md` when this lands.
- **Very long beats.** Static sections are cheap but not free; dozens of texts
  would want windowing. Not a v1 concern — just don't design it out.

Not a risk, worth knowing: **the same `WriteItem` can be composed into several
beats**, so two manuscripts can contain the same section. Edits propagate
through the existing live queries, which is correct and needs no handling.

---

## Part 3 — Editing the plot item

### Decision: `PlotItemDialog` stays a dialog, and gets shorter

With composition moving to the manuscript, the dialog is left holding title,
beat label, description, icon, dot colour, dot variant and attachments — short
again, and fast to open, adjust and close from the timeline. Recolouring a dot
should not cost a page navigation.

Two consequences:

- The **beat card needs an obvious way into the manuscript**, since composition
  is no longer reachable from the dialog.
- `createComposedText`'s defensive `setPlotItemWriteItems` call **goes away**
  with the navigation that motivated it.

**Rejected — promoting the beat to a page.** Room for everything, but it costs
the glance-and-close speed of editing from the timeline and would duplicate
composition editing in two places once the manuscript exists.

---

## Mobile

Below `sm` the `SideNav` is already a horizontal top strip
(`flexDirection: { xs: "row", sm: "column" }`), so there is barely any app
chrome behind to dim.

| Question | Decision |
| --- | --- |
| Presentation | **Full-bleed below `sm`**, inset card with a scrim at `sm` and up — MUI's own `fullScreen` Dialog pattern via `useMediaQuery(theme.breakpoints.down("sm"))`. Matches the codebase's single breakpoint. |
| Formatting | **A horizontally scrolling strip docked above the keyboard**, rather than the floating pill. A floating selection toolbar fires on the same gesture as iOS/Android's own copy-paste callout and would collide; the OS bubble's position cannot be measured. Costs a `VisualViewport` listener to track keyboard height. |
| Measure | Nothing to do. `66ch` is a *max-width*, so a narrow viewport binds first — a 390px phone gets ~350px after padding, about 37 characters, a normal mobile reading measure. It never forces horizontal overflow. |

---

## Constraints that do not move

Load-bearing in the existing code.

- **Routes are the dialog state** (root `AGENTS.md`). Back, refresh and deep
  links must work.
- **There is no `write/new`.** A draft row is created at the click site and the
  editor opens on its real id, because a create-on-mount effect fires twice under
  `StrictMode`.
- **`discardWriteItemIfBlank` runs deferred one tick** and must not fire on
  StrictMode's dev remount.
- **No Save button and no Cancel.** `SaveStatus` is the only thing that says a
  write happened.
- **MUI only.** No `.css` files, no hardcoded hex (the dark `SideNav` is the one
  sanctioned exception), no hand-written inline `<svg>` icons.
- **`plotItems.sortOrder` is a cache of row order.** Nothing here writes it;
  composition order lives in `writeItemIds` and is unrelated to the spine.

---

## Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-08-29 | **Part 1: Option A** — overlay over the workspace with a dimmed scrim; route stays under `WorkspaceLayout`. | The scrim is what makes it read as stepping out of the app; deep links, back and refresh keep working untouched. |
| 2026-08-29 | **Part 2: Option B** — a beat's composed texts drawn as one continuous manuscript. | The reading order is the point of `writeItemIds`; showing it as prose beats showing it as a list of titles. |
| 2026-08-29 | **Part 2a: lazy-mounted editor** — static sections, one mounted editor. | Keeps `useAutosave`, `SaveStatus` and the toolbar/mentions/history wiring exactly as they are. Performance was the motivation; correctness is the stronger reason. |
| 2026-08-29 | **Static sections render by walking the serialized JSON**, split pure/renderer. | No new dependency; `lexical` exports the format constants; mentions become real React handlers; the pure half is testable in the existing `node` environment. |
| 2026-08-29 | **Blank drafts are discarded when the surface closes**, not on editor unmount. | The overlay is the new "page", so the existing rule and its StrictMode guard move across unchanged; a blank section stays clickable while you are still in the beat. |
| 2026-08-29 | **Undo is per-section.** | Autosave has already persisted the previous section, so crossing the boundary would mean undoing a written change. |
| 2026-08-29 | **Part 3: `PlotItemDialog` stays a dialog**, shortened. | Recolouring a dot should not cost a page navigation; composition lives with the prose instead. |
| 2026-08-29 | **Toolbar floats on selection** (pointer) / **docks above the keyboard** (touch). | No layout shift as sections are entered; on touch a floating pill would collide with the OS copy-paste callout. |
| 2026-08-29 | **Prose face is author-settable** (`localStorage`, default serif); **measure fixed at 66ch**. | The face is a genuine preference; line length has a right answer, and `ch` keeps it constant across faces. |
| 2026-08-29 | **Full-bleed below `sm`.** | At `xs` the SideNav is a top strip, so there is nothing meaningful to dim and an inset card wastes a seventh of the screen. |
| 2026-08-29 | **Chrome fades while typing**; **Esc closes**; **live word count**; no typewriter scrolling or paragraph highlight in v1. | The first three are cheap and expected; the last two are riskier and can be added once the manuscript's own focus cues are settled. |
