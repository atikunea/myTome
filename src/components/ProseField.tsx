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
import { type EditorState } from "lexical";
import type { SaveState } from "../hooks/autosave";
import { useAutosave } from "../hooks/useAutosave";
import { asProseDocument, blocksText, lexicalToBlocks } from "../lexical/blocks";
import { ProseToolbarPlugin } from "../lexical/ProseToolbarPlugin";
import { CaretAtPointPlugin, type CaretPoint } from "../lexical/CaretAtPointPlugin";
import { StaticProse } from "./StaticProse";
import { manuscriptSx, proseTextTheme, type ProseFace } from "./manuscriptStyles";

/**
 * One block of prose on the element page: static markup until it is clicked,
 * then the page's single live editor, with the caret where the click landed.
 *
 * This is `ProseManuscript`'s arrangement applied to fields instead of
 * sections, and it inherits that surface's one hard constraint: **the static
 * and mounted renders must occupy identical space.** The click point is
 * resolved against the editor's own DOM after it has replaced the markup, and
 * it only lands on the right word while the two agree — which is why both
 * branches below render from `manuscriptSx(face)` through the same wrapper,
 * why the wrapper's padding does not depend on `active`, and why a description
 * on this page reads as prose rather than as a bordered form control. Making it
 * look like a `TextField` at rest would be a caret bug, not a style choice.
 *
 * The active accent is a `::before` in the gutter for the same reason a border
 * would be wrong: a real border moves the text it surrounds by a pixel or two.
 */
export function ProseField({
  value,
  active,
  caretPoint,
  face,
  placeholder,
  editorKey,
  save,
  onActivate,
  onEdit,
  onSaveState,
  flushRef,
}: {
  /** The document to draw — the latest edit, which may be ahead of the row. */
  value: string;
  active: boolean;
  /** Where the author clicked to get here, in viewport coordinates. */
  caretPoint: CaretPoint | null;
  face: ProseFace;
  /** Shown in place of the prose while the field is empty. */
  placeholder: string;
  /**
   * Identifies the field being edited. The mounted editor is keyed by it, so
   * moving between two prose fields tears one editor down and builds another
   * rather than reseeding a live one.
   */
  editorKey: string;
  save: (value: string) => Promise<void>;
  onActivate: (point: CaretPoint) => void;
  onEdit: (value: string) => void;
  onSaveState: (state: SaveState, retry: () => void) => void;
  /** Receives the unmount flush, so a page can sequence a sweep after it. */
  flushRef?: MutableRefObject<Promise<unknown> | null>;
}) {
  // **Normalized before anything else touches it.** A `prose` field an author
  // has never written in holds `""`, and a field whose kind was changed from
  // `text` holds a line of plain text; Lexical throws on the first and would
  // bury the second. `asProseDocument` is a no-op on a real document, so this
  // costs a `startsWith` on the common path.
  const doc = useMemo(() => asProseDocument(value), [value]);
  // Parsed once for both questions the static branch asks of the document.
  const blocks = useMemo(() => lexicalToBlocks(doc), [doc]);
  const empty = !blocksText(blocks).trim();

  return (
    <Box
      onClick={(event) => {
        // Always stopped, active or not. The page clears the active field on
        // any click that reaches it, so without this a click meant to move the
        // caret would deactivate the very field it landed in — and a click that
        // activates one would be undone by its own bubble.
        event.stopPropagation();
        if (!active) onActivate({ x: event.clientX, y: event.clientY });
      }}
      sx={{
        position: "relative",
        // Identical in both states: the gutter, the padding and the negative
        // margin that cancels it are what keep the prose in one place across
        // the swap, so the hover target can be generous without moving anything.
        px: 1.25,
        mx: -1.25,
        py: 0.75,
        my: -0.75,
        borderRadius: 1,
        cursor: active ? "auto" : "text",
        transition: (theme) => theme.transitions.create("background-color"),
        "&:hover": { bgcolor: active ? "transparent" : "action.hover" },
        "&::before": {
          content: '""',
          position: "absolute",
          left: (theme) => theme.spacing(-0.75),
          top: 4,
          bottom: 4,
          width: 2,
          borderRadius: 1,
          bgcolor: "primary.main",
          opacity: active ? 1 : 0,
          transition: (theme) => theme.transitions.create("opacity"),
        },
        ...manuscriptSx(face),
      }}
    >
      {active ? (
        <ProseFieldEditor
          key={editorKey}
          value={doc}
          caretPoint={caretPoint}
          save={save}
          onEdit={onEdit}
          onSaveState={onSaveState}
          flushRef={flushRef}
        />
      ) : (
        <StaticProse blocks={blocks} />
      )}
      {empty ? (
        <Typography
          color="text.secondary"
          sx={{
            position: "absolute",
            top: (theme) => theme.spacing(0.75),
            left: (theme) => theme.spacing(1.25),
            pointerEvents: "none",
            font: "inherit",
            fontStyle: "italic",
          }}
        >
          {placeholder}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * The live editor for one prose field. Mounted only while its field is active,
 * which is what lets it own an autosave machine of its own: the unmount flush
 * closes over *this* field's value, so a debounce in flight can never land on
 * the field the author moved to.
 *
 * It carries no `MentionsPlugin`. Mentions are prose-to-element links that are
 * deliberately not cascade-maintained, and an element description is where
 * `Relationship` already does that job properly.
 */
function ProseFieldEditor({
  value,
  caretPoint,
  save,
  onEdit,
  onSaveState,
  flushRef,
}: {
  value: string;
  caretPoint: CaretPoint | null;
  save: (value: string) => Promise<void>;
  onEdit: (value: string) => void;
  onSaveState: (state: SaveState, retry: () => void) => void;
  flushRef?: MutableRefObject<Promise<unknown> | null>;
}) {
  // The latest document, in a ref so the save timer never closes over a stale
  // render — the same reason `ProseEditor` keeps one.
  const latest = useRef(value);

  const { state, autosave } = useAutosave(() => save(latest.current));

  useEffect(() => {
    onSaveState(state, autosave.saveNow);
  }, [state, autosave, onSaveState]);

  useEffect(() => {
    return () => {
      const pending = autosave.flush();
      if (flushRef) flushRef.current = pending;
      void pending;
    };
  }, [autosave, flushRef]);

  const initialConfig = useMemo(
    () => ({
      namespace: "myTome",
      // Read once, at mount: this component is keyed by field at the call site,
      // so a different field means a new instance rather than a reseed.
      editorState: latest.current,
      // The vocabulary `lexical/blocks.ts` knows how to read back, minus
      // mentions. Anything added here has to be taught to that file too.
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
      // The same class names `StaticProse` puts on its runs, so the field keeps
      // its exact appearance across the swap.
      theme: { text: proseTextTheme },
      onError: (error: Error) => console.error(error),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = (editorState: EditorState) => {
    const next = JSON.stringify(editorState);
    // Lexical reports selection-only updates through this callback and fires
    // once on mount. Neither is an edit; without the guard the indicator
    // announces a save every time the caret moves.
    if (next === latest.current) return;
    latest.current = next;
    onEdit(next);
    autosave.schedule();
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={<Box component={ContentEditable} sx={{ outline: "none" }} />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <ListPlugin />
      <CheckListPlugin />
      <LinkPlugin />
      <OnChangePlugin onChange={handleChange} />
      <ProseToolbarPlugin />
      <CaretAtPointPlugin point={caretPoint} />
    </LexicalComposer>
  );
}
