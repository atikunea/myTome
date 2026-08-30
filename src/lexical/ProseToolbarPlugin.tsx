import { useCallback, useEffect, useMemo, useState } from "react";
import { Paper, Popper, Portal, useMediaQuery } from "@mui/material";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { ToolbarPlugin, type ToolbarItem } from "./ToolbarPlugin";

/**
 * The formatting controls for the focus surface, which has no room for a
 * standing toolbar.
 *
 * Two presentations, chosen by input rather than by width. On a pointer device
 * a pill floats over the selection, so nothing occupies the page while the
 * author writes. On touch it becomes a strip docked above the keyboard: a
 * floating pill would appear on the same gesture as the OS copy-and-paste
 * callout, whose position cannot be measured and therefore cannot be avoided.
 *
 * Both render `ToolbarPlugin` in its `"bare"` variant, so every control — the
 * block picker, the link popover, the format menus — behaves identically to the
 * standing bar rather than being reimplemented twice.
 */
export function ProseToolbarPlugin() {
  const coarse = useMediaQuery("(pointer: coarse)");
  return coarse ? <DockedToolbar /> : <SelectionToolbar />;
}

/** Enough to mark up a sentence without becoming a second toolbar. */
const floatingItems: ToolbarItem[][] = [
  ["bold", "italic", "underline", "formatMenu"],
  ["link"],
];

/**
 * Wider than the floating set: a phone has no keyboard shortcuts to fall back
 * on, so the block picker and lists have to be reachable here or not at all.
 * The strip scrolls horizontally rather than wrapping.
 */
const dockedItems: ToolbarItem[][] = [
  ["bold", "italic", "underline"],
  ["blockType"],
  ["listMenu", "link"],
  ["formatMenu", "clearFormatting"],
];

function SelectionToolbar() {
  const [editor] = useLexicalComposerContext();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const sync = useCallback(() => {
    const ranged = editor
      .getEditorState()
      .read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && !selection.isCollapsed();
      });
    if (!ranged) return setRect(null);
    // The rect has to come from the DOM selection rather than from Lexical:
    // only the browser knows where the selected text actually landed on screen.
    const native = window.getSelection();
    if (!native || native.rangeCount === 0) return setRect(null);
    const next = native.getRangeAt(0).getBoundingClientRect();
    setRect(next.width || next.height ? next : null);
  }, [editor]);

  useEffect(() => {
    const reposition = () => sync();
    window.addEventListener("resize", reposition);
    // The surface scrolls its own container, not the window, so this has to be
    // a capturing listener on the document to hear about it at all.
    document.addEventListener("scroll", reposition, true);
    return mergeRegister(
      editor.registerUpdateListener(sync),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          sync();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      () => {
        window.removeEventListener("resize", reposition);
        document.removeEventListener("scroll", reposition, true);
      },
    );
  }, [editor, sync]);

  // A virtual anchor: there is no element over the selection to point at, only
  // a rectangle.
  const anchorEl = useMemo(
    () => (rect ? { getBoundingClientRect: () => rect } : null),
    [rect],
  );

  if (!anchorEl) return null;

  return (
    <Popper
      open
      anchorEl={anchorEl}
      placement="top"
      modifiers={[{ name: "offset", options: { offset: [0, 10] } }]}
      sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
    >
      <Paper
        elevation={8}
        // The pill must never take the caret: without this the selection
        // collapses the instant it is pressed and the command applies to
        // nothing. `ToolButton` does the same for each control; this covers the
        // padding between them.
        onMouseDown={(event) => event.preventDefault()}
        sx={{ px: 0.5, py: 0.25, borderRadius: 2 }}
      >
        <ToolbarPlugin variant="bare" items={floatingItems} />
      </Paper>
    </Popper>
  );
}

function DockedToolbar() {
  // How much of the layout viewport the on-screen keyboard is covering. Without
  // this the strip sits under the keyboard, which is exactly where it is not
  // wanted.
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () =>
      setKeyboard(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);

  return (
    <Portal>
      {/*
        Shown for as long as a section is mounted, rather than tracked against
        editor focus. Blur on touch arrives through pointer events that cannot
        be suppressed the way `mousedown` can, so hiding on blur makes the strip
        flicker away under the finger reaching for it. A mounted section *is*
        the author editing, so that is the condition worth binding to.
      */}
      <Paper
        square
        elevation={8}
        onMouseDown={(event) => event.preventDefault()}
        sx={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: keyboard,
          zIndex: (theme) => theme.zIndex.tooltip,
          borderTop: 1,
          borderColor: "divider",
          px: 0.5,
          py: 0.5,
          overflowX: "auto",
          // The strip is meant to be swiped through; its own scrollbar would
          // eat most of the height it has.
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        <ToolbarPlugin variant="bare" items={dockedItems} />
      </Paper>
    </Portal>
  );
}
