import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isListItemNode } from "@lexical/list";
import {
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  INDENT_CONTENT_COMMAND,
  INSERT_TAB_COMMAND,
  KEY_TAB_COMMAND,
} from "lexical";

/**
 * Tab types a tab, the way it does on a typewriter or in a word processor.
 *
 * Lexical already has the node (`TabNode`, one `\t`) and the command that
 * inserts it; what it leaves alone is the key, so without this the browser
 * takes Tab and moves focus to the next control. Inside a list item Tab nests
 * the item instead, which is what a word processor does there.
 *
 * - **Shift+Tab is left to the browser**, so a keyboard user is never trapped
 *   in the editor: it still moves focus out, and Escape still closes the
 *   surface.
 * - **Registered at editor priority**, the lowest. The mentions typeahead
 *   claims Tab at a higher one to pick the highlighted element, so while its
 *   menu is open Tab still does that.
 * - **Mounted only in `ProseEditor`**, the writing surface. `ProseField` sits
 *   among other fields on the element, tome and author pages, where Tab moving
 *   between them is worth more than a tab character.
 *
 * Nothing else needs to learn about tabs: `lexical/blocks.ts` reads a tab node
 * as the text run it is, the static render keeps it through `pre-wrap`, and
 * `manuscriptDocx.ts` writes it as a Word tab.
 */
export function TabKeyPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return false;
          event.preventDefault();
          const inList = selection
            .getNodes()
            .some((node) => $findMatchingParent(node, $isListItemNode) !== null);
          return editor.dispatchCommand(
            inList ? INDENT_CONTENT_COMMAND : INSERT_TAB_COMMAND,
            undefined,
          );
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    [editor],
  );

  return null;
}
