import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Box, Typography } from "@mui/material";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { LinkNode } from "@lexical/link";
import {
  $createRangeSelectionFromDom,
  $getRoot,
  $setSelection,
  type EditorState,
} from "lexical";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { WriteItemType } from "../models/WriteItem";
import type { SaveState } from "../hooks/autosave";
import { store } from "../services/store";
import { useAutosave } from "../hooks/useAutosave";
import { MentionNode } from "../lexical/MentionNode";
import { MentionsPlugin } from "../lexical/MentionsPlugin";
import { ProseToolbarPlugin } from "../lexical/ProseToolbarPlugin";
import { manuscriptSx, proseTextTheme, type ProseFace } from "./manuscriptStyles";

/** What the manuscript learns each time the author types into a section. */
export type ProseEdit = { content: string; preview: string; text: string };

/** A click position to resolve the caret against once the editor has mounted. */
export type CaretPoint = { x: number; y: number };

/**
 * The one live Lexical editor on the surface.
 *
 * **Exactly one of these is mounted at a time**, keyed by write-item id. That is
 * what lets `useAutosave` stay one machine writing one row, `SaveStatus` report
 * a single unambiguous state, and the toolbar, mentions and history attach to an
 * editor without anything having to decide *which* editor. Every other section
 * of the manuscript is static markup from `StaticProse`.
 *
 * Because the machine lives and dies with this component, a pending edit can
 * never be written to the row the author moved on to: the unmount flush closes
 * over this section's own values.
 *
 * Title and type are owned here too, not just the document — they are fields of
 * the same row and share its debounce, so a renamed chapter cannot be saved
 * without the paragraph that was typed alongside it.
 */
export function ProseEditor({
  itemId,
  title,
  type,
  content,
  face,
  elements,
  types,
  caretPoint,
  flushRef,
  onEdit,
  onSaveState,
}: {
  itemId: string;
  title: string;
  type: WriteItemType;
  /**
   * The document to open on — the manuscript's latest known text for this
   * section, which may be ahead of the stored row by one debounce.
   */
  content: string;
  face: ProseFace;
  elements: Element[];
  types: ElementType[];
  /** Where the author clicked to get here, in viewport coordinates. */
  caretPoint?: CaretPoint | null;
  /** Receives the unmount flush, so the page can sequence its discard after it. */
  flushRef?: MutableRefObject<Promise<unknown> | null>;
  onEdit: (edit: ProseEdit) => void;
  onSaveState: (state: SaveState, retry: () => void) => void;
}) {
  // Latest values for the debounced write, kept in a ref so the save timer never
  // closes over a stale render.
  const latest = useRef({ title, type, content, preview: "" });

  const { state: saveState, autosave } = useAutosave(() =>
    store.saveWriteItem({ id: itemId, ...latest.current }),
  );

  useEffect(() => {
    onSaveState(saveState, autosave.saveNow);
  }, [saveState, autosave, onSaveState]);

  // Title and type are edited in the section's header, above this component,
  // so they arrive as props and are folded into the same pending write.
  useEffect(() => {
    if (title === latest.current.title && type === latest.current.type) return;
    latest.current = { ...latest.current, title, type };
    autosave.schedule();
  }, [title, type, autosave]);

  useEffect(() => {
    return () => {
      // `useAutosave` has already dropped the pending timers; `flush` writes
      // whatever edit they were holding, closing over *this* section's values.
      //
      // Unlike the old page this does not discard a blank draft: leaving a
      // section is no longer leaving the surface, so that sweep belongs to the
      // page that owns the surface. It does have to happen *before* that sweep,
      // or a draft the author actually typed into would still look blank in the
      // database and be deleted — hence the promise handed back through
      // `flushRef` for the page to await.
      const pending = autosave.flush();
      if (flushRef) flushRef.current = pending;
      void pending;
    };
  }, [autosave, flushRef]);

  const initialConfig = useMemo(
    () => ({
      namespace: "myTome",
      // Read once, at mount: this component is keyed by id at the call site, so
      // a different document means a new instance rather than a reseed.
      editorState: content,
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, MentionNode],
      // The same class names `StaticProse` puts on its runs, so a section keeps
      // its exact appearance across the swap. See `proseTextTheme`.
      theme: { text: proseTextTheme },
      onError: (error: Error) => console.error(error),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = (editorState: EditorState) => {
    const next = JSON.stringify(editorState);
    // Lexical reports selection-only updates through the same callback, and
    // fires once on mount. Neither is an edit, and both used to schedule a
    // write: without this guard the indicator announces a save every time the
    // caret moves, and a freshly opened chapter opens on "Editing…".
    if (next === latest.current.content) return;
    const text = editorState.read(() => $getRoot().getTextContent());
    latest.current = { ...latest.current, content: next, preview: text };
    onEdit({ content: next, preview: text, text });
    autosave.schedule();
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <Box sx={{ position: "relative", ...manuscriptSx(face) }}>
        <RichTextPlugin
          contentEditable={<Box component={ContentEditable} sx={{ outline: "none" }} />}
          placeholder={
            <Typography
              color="text.secondary"
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                pointerEvents: "none",
                font: "inherit",
              }}
            >
              Start writing… type @ to mention an element.
            </Typography>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <LinkPlugin />
        <OnChangePlugin onChange={handleChange} />
        <MentionsPlugin elements={elements} types={types} />
        <ProseToolbarPlugin />
        <CaretAtPointPlugin point={caretPoint} />
      </Box>
    </LexicalComposer>
  );
}

type ResolvedPoint = { node: Node; offset: number };

/**
 * `caretPositionFromPoint` where it exists, and WebKit's older
 * `caretRangeFromPoint` where it does not. Neither is reliably on `Document` in
 * the DOM lib, hence the narrow local shape.
 */
function positionFromPoint(x: number, y: number): ResolvedPoint | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/**
 * Puts the caret where the author clicked.
 *
 * Mounting an editor does not place a caret, so without this a click lands the
 * author at the top of a chapter they meant to edit the middle of. The point is
 * resolved **after** mount, against the editor's own freshly rendered DOM —
 * which finds the right word only because the static and mounted renders share
 * `manuscriptSx` and therefore occupy identical space.
 *
 * The native selection is set directly rather than assembled as a Lexical
 * range: that is what the browser does for an ordinary click, and Lexical picks
 * it up through the `selectionchange` it already listens for.
 */
function CaretAtPointPlugin({ point }: { point?: CaretPoint | null }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const root = editor.getRootElement();

    /**
     * Resolves the click point against the editor's own DOM, which has already
     * replaced the static markup by the time an effect runs — querying a caret
     * position forces the layout flush that needs, so **no animation frame is
     * involved**. An earlier version deferred this to `requestAnimationFrame`,
     * which is a bad bet for the primary interaction: a frame that never
     * arrives (a backgrounded tab, a throttled compositor) left the section
     * mounted but unfocused, with the author's typing going nowhere and nothing
     * to retry it.
     */
    const placeCaret = () => {
      if (!root || !point) return false;
      // Force a style and layout pass before hit-testing: the static markup this
      // editor replaced was removed in the same commit, and until layout is
      // flushed the hit test can resolve into those detached nodes.
      void root.getBoundingClientRect();
      const resolved = positionFromPoint(point.x, point.y);

      // **Only a text node carries a character offset.** An element resolution
      // means the point landed on a box rather than in a run of text, and its
      // `offset` is a child index — using it puts the caret at the *start of the
      // block*, which is precisely the bug this guard exists to prevent. It
      // happens on the first attempt because Lexical reconciles the document
      // into the DOM a microtask after mount, so the editor is still empty here.
      // Treat it as a miss and let the retry below run.
      if (!resolved || resolved.node.nodeType !== Node.TEXT_NODE) return false;
      const container = resolved.node.parentElement;
      if (!container || !root.contains(container)) return false;

      root.focus({ preventScroll: true });
      const domSelection = window.getSelection();
      if (!domSelection) return false;
      const range = document.createRange();
      try {
        range.setStart(resolved.node, resolved.offset);
      } catch {
        return false;
      }
      range.collapse(true);
      domSelection.removeAllRanges();
      domSelection.addRange(range);

      // **Hand the position to Lexical; do not leave it in the DOM.** Focusing
      // the root makes Lexical queue an update of its own, and when that commits
      // a microtask later it reconciles the editor state's selection back onto
      // the DOM — quietly dragging the caret to the start of the block and
      // undoing the placement above. Writing the selection into the editor state
      // is what survives that reconcile. This update is queued after the focus
      // one, so it is the last word.
      editor.update(() => {
        const selection = $createRangeSelectionFromDom(domSelection, editor);
        if (selection) $setSelection(selection);
      });
      return true;
    };

    // Focus is not optional; landing the caret exactly is the refinement. The
    // synchronous attempt runs first, and `editor.focus()` is called only when
    // it misses — calling it after a hit would queue a Lexical `selectEnd` that
    // commits a microtask later and overwrite the caret we just placed.
    if (placeCaret()) return;
    editor.focus();

    // Retry on a macrotask rather than an animation frame. What the first
    // attempt is waiting for is Lexical's reconciliation, which lands in a
    // microtask, so a `setTimeout` is both sufficient and — unlike a frame —
    // guaranteed to arrive in a backgrounded tab or a throttled compositor.
    // Focus is already correct either way, so a miss costs only precision.
    let attempts = 0;
    let timer = 0;
    const retry = () => {
      if (placeCaret() || ++attempts >= 3) return;
      timer = window.setTimeout(retry, 0);
    };
    timer = window.setTimeout(retry, 0);
    return () => window.clearTimeout(timer);
    // Deliberately once, on mount: the point is where this section was entered,
    // not something that changes while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return null;
}
