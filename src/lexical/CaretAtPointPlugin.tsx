import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createRangeSelectionFromDom, $setSelection } from "lexical";

/**
 * Click-to-edit's other half, kept here rather than beside one of its callers.
 *
 * It was private to `components/ProseEditor` while the manuscript was the only
 * surface that swapped static prose for a live editor. The element page does
 * the same thing to a description and to every `prose` field, and the three
 * traps below are not the kind of thing anyone would enjoy rediscovering in a
 * second copy — so it moved to where Lexical's other internals live.
 */

/** A click position to resolve the caret against once the editor has mounted. */
export type CaretPoint = { x: number; y: number };

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
export function CaretAtPointPlugin({ point }: { point?: CaretPoint | null }) {
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
