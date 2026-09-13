import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Box, Typography } from "@mui/material";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
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
import { $getRoot, type EditorState } from "lexical";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { WriteItemType } from "../models/WriteItem";
import type { SaveState } from "../hooks/autosave";
import { store } from "../services/store";
import { useAutosave } from "../hooks/useAutosave";
import { MentionNode } from "../lexical/MentionNode";
import { MentionsPlugin } from "../lexical/MentionsPlugin";
import { ProseToolbarPlugin } from "../lexical/ProseToolbarPlugin";
import { CaretAtPointPlugin, type CaretPoint } from "../lexical/CaretAtPointPlugin";
import { manuscriptSx, proseTextTheme, type ProseFace } from "./manuscriptStyles";

/** What the manuscript learns each time the author types into a section. */
export type ProseEdit = { content: string; preview: string; text: string };

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
      <Box
        sx={{
          position: "relative",
          // Contains the blocks' margins, as the static body's padding does in
          // `ProseManuscript`. Without it the last paragraph's bottom margin
          // collapses out of a live section and into the gap below, so a section
          // is 16px shorter live than static — and entering a later section,
          // which turns an earlier one static, moves the clicked text down under
          // the cursor before the caret is placed.
          display: "flow-root",
          ...manuscriptSx(face),
        }}
      >
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
