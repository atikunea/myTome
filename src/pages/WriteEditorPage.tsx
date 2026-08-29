import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
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
import type { PlotItem } from "../models/Plot";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import { writeItemTypeLabels, writeItemTypes } from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { useObservable } from "../hooks/useObservable";
import { MentionsPlugin } from "../lexical/MentionsPlugin";
import { ToolbarPlugin } from "../lexical/ToolbarPlugin";
import { MENTION_ATTRIBUTE } from "../lexical/MentionNode";
import { MentionNode } from "../lexical/MentionNode";
import { WriteItemTypeIcon } from "../components/WriteItemTypeIcon";
import { SaveStatus } from "../components/SaveStatus";
import { useAutosave } from "../hooks/useAutosave";

export function WriteEditorPage() {
  const { writeItemId } = useParams<{ writeItemId: string }>();
  const { tome } = useTomeWorkspace();
  const item = useObservable<WriteItem | null>(
    (cb) => store.observeWriteItem(writeItemId!, cb),
    [writeItemId],
  );

  if (!tome || item === undefined) return null;
  if (item === null)
    return (
      <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
        That text no longer exists
      </Typography>
    );

  // Keyed by id so switching items rebuilds the editor with the new document;
  // a live re-emit of the same row (this page's own autosave echo) must not.
  return <WriteEditor key={item.id} item={item} tomeId={tome.id} />;
}

function WriteEditor({ item, tomeId }: { item: WriteItem; tomeId: string }) {
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const { types } = useTomeWorkspace();
  const [title, setTitle] = useState(item.title);
  const [type, setType] = useState<WriteItemType>(item.type);
  const [beats, setBeats] = useState<PlotItem[]>([]);

  const elements =
    useObservable<Element[]>(
      (cb) => store.observeTomeElements(tomeId, cb),
      [tomeId],
    ) ?? [];

  // Latest values for the debounced write, kept in a ref so the save timer never
  // closes over a stale render.
  const latest = useRef({
    title: item.title,
    type: item.type,
    content: item.content,
    preview: item.preview,
  });
  const alive = useRef(true);
  const itemId = item.id;

  // All the timing lives in `hooks/autosave.ts`; this page only says when an
  // edit happened and renders whatever state comes back.
  const { state: saveState, autosave } = useAutosave(() =>
    store.saveWriteItem({ id: itemId, ...latest.current }),
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // `useAutosave` has already dropped the pending timers; `flush` writes
      // whatever edit they were holding.
      //
      // Deferred a tick because StrictMode's dev-only remount runs this cleanup
      // on a page that is about to come straight back; discarding there would
      // delete a draft the author is still looking at. A real unmount leaves
      // `alive` false and the discard goes through.
      window.setTimeout(async () => {
        await autosave.flush();
        if (!alive.current) await store.discardWriteItemIfBlank(itemId);
      }, 0);
    };
  }, [itemId, autosave]);

  useEffect(() => {
    let active = true;
    store.composingPlotItems(itemId).then((rows) => {
      if (active) setBeats(rows);
    });
    return () => {
      active = false;
    };
  }, [itemId]);

  const initialConfig = useMemo(
    () => ({
      namespace: "myTome",
      // Read once, at mount: the document is seeded from the row that was loaded
      // when this component was keyed into existence.
      editorState: item.content,
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        LinkNode,
        MentionNode,
      ],
      // Bold and italic get `<strong>`/`<em>` from Lexical, but underline and
      // strikethrough are class-only: with no theme they set state that never
      // reaches the page. These are the one case that cannot be styled from a
      // tag or attribute selector, so they get class names to hang CSS on.
      theme: {
        text: {
          underline: "editor-underline",
          strikethrough: "editor-strikethrough",
          underlineStrikethrough: "editor-underline-strikethrough",
        },
      },
      onError: (error: Error) => console.error(error),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = (editorState: EditorState) => {
    const content = JSON.stringify(editorState);
    // Lexical reports selection-only updates through the same callback, and
    // fires once on mount. Neither is an edit, and both used to schedule a
    // write: without this guard the indicator announces a save every time the
    // caret moves, and a freshly opened chapter opens on "Editing…".
    if (content === latest.current.content) return;
    const preview = editorState.read(() => $getRoot().getTextContent());
    latest.current = { ...latest.current, content, preview };
    autosave.schedule();
  };

  // Mentions are plain DOM inside the contentEditable, so the click is caught
  // here rather than wired per node. An id that resolves to nothing is inert —
  // deleting an element does not scrub mentions of it from existing prose.
  const handleMentionClick = (event: React.MouseEvent<HTMLElement>) => {
    const mention = (event.target as HTMLElement).closest?.(
      `[${MENTION_ATTRIBUTE}]`,
    );
    if (!mention) return;
    const elementId = mention.getAttribute(MENTION_ATTRIBUTE);
    const element = elements.find((candidate) => candidate.id === elementId);
    if (!element) return;
    event.preventDefault();
    navigate(
      `/tomes/${tomeId}/elements/${element.elementTypeId}/${element.id}/edit`,
    );
  };

  // Return to wherever the reader came from (a plot beat, search, the list).
  // A direct load has no in-app entry to pop, so fall back to the write list.
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(`/tomes/${tomeId}/write`);
  };

  return (
    // No `minHeight: 100%` here: `main` already sits in a `100vh` grid, so
    // stretching to its full height and then adding the header would push the
    // page past the viewport and produce a scrollbar over empty space.
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { sm: "center" }, mb: 1.5 }}
      >
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={goBack}
          sx={{ alignSelf: "flex-start", flexShrink: 0 }}
        >
          Back
        </Button>
        <Box sx={{ flex: 1 }} />
        {/* Sits after the spacer so the spacer, not the type picker, absorbs
            the width change as the words switch — nothing to its right moves. */}
        <SaveStatus
          state={saveState}
          savedAt={item.updatedAt}
          onRetry={autosave.saveNow}
        />
        <TextField
          select
          size="small"
          label="Type"
          value={type}
          onChange={(event) => {
            const next = event.target.value as WriteItemType;
            setType(next);
            latest.current = { ...latest.current, type: next };
            autosave.schedule();
          }}
          sx={{ minWidth: 150 }}
        >
          {writeItemTypes.map((option) => (
            <MenuItem key={option} value={option}>
              <WriteItemTypeIcon
                type={option}
                fontSize="small"
                sx={{ mr: 1, verticalAlign: "text-bottom" }}
              />
              {writeItemTypeLabels[option]}
            </MenuItem>
          ))}
        </TextField>
        <Button
          color="error"
          onClick={() =>
            confirmAction(
              `Permanently delete "${title.trim() || "this text"}"? This cannot be undone.`,
              async () => {
                // The row is going away; stop the pending autosave from
                // recreating fields on a deleted id, and drop the indicator
                // back to rest so it cannot sit on "Saving…" over a row that
                // no longer exists.
                autosave.reset();
                await store.deleteWriteItem(itemId);
                navigate(`/tomes/${tomeId}/write`);
              },
            )
          }
        >
          Delete
        </Button>
      </Stack>

      <TextField
        variant="standard"
        placeholder="Untitled"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          latest.current = { ...latest.current, title: event.target.value };
          autosave.schedule();
        }}
        fullWidth
        slotProps={{
          input: { sx: { fontSize: "1.7rem", fontWeight: 600, py: 0.5 } },
        }}
      />

      {beats.length ? (
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75, mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
            Used in
          </Typography>
          {beats.map((beat) => (
            <Chip
              key={beat.id}
              size="small"
              variant="outlined"
              label={beat.title}
              onClick={() =>
                navigate(`/tomes/${tomeId}/plots/${beat.plotId}/items/${beat.id}`)
              }
            />
          ))}
        </Stack>
      ) : null}

      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin />
        <Box
          onClick={handleMentionClick}
          sx={{
            position: "relative",
            flex: 1,
            // Mentions are styled from here rather than in `createDOM`, which
            // runs outside React and cannot reach the MUI theme.
            [`& [${MENTION_ATTRIBUTE}]`]: {
              color: "primary.main",
              textDecoration: "underline",
              cursor: "pointer",
              borderRadius: "3px",
              "&:hover": { bgcolor: "action.hover" },
            },
          }}
        >
          <RichTextPlugin
            contentEditable={
              <Box
                component={ContentEditable}
                sx={{
                  outline: "none",
                  minHeight: 360,
                  lineHeight: 1.7,
                  fontSize: "1.02rem",
                  "& p": { m: 0, mb: 1.5 },
                  "& h1, & h2, & h3": { mt: 2.5, mb: 1, lineHeight: 1.25 },
                  "& h1": { fontSize: "1.7rem" },
                  "& h2": { fontSize: "1.4rem" },
                  "& h3": { fontSize: "1.18rem" },
                  "& ul, & ol": { m: 0, mb: 1.5, pl: 3.5 },
                  "& li": { mb: 0.35 },
                  // Check list items are found by the role Lexical stamps on
                  // them, not a theme class, for the same reason mentions are
                  // styled from here: `createDOM` runs outside React and cannot
                  // reach the MUI theme. The box is a `::before` because
                  // `CheckListPlugin` hit-tests clicks against that
                  // pseudo-element's computed width — give it none and the
                  // checkbox cannot be ticked.
                  '& li[role="checkbox"]': {
                    listStyle: "none",
                    position: "relative",
                    ml: -1.5,
                    pl: 3,
                    outline: "none",
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      left: 0,
                      top: "0.3em",
                      width: 16,
                      height: 16,
                      boxSizing: "border-box",
                      border: 1.5,
                      borderColor: "text.disabled",
                      borderRadius: "3px",
                      cursor: "pointer",
                    },
                  },
                  '& li[role="checkbox"][aria-checked="true"]': {
                    color: "text.secondary",
                    textDecoration: "line-through",
                    "&::before": {
                      bgcolor: "primary.main",
                      borderColor: "primary.main",
                    },
                    "&::after": {
                      content: '""',
                      position: "absolute",
                      left: 5,
                      top: "calc(0.3em + 2px)",
                      width: 5,
                      height: 9,
                      borderStyle: "solid",
                      borderColor: "primary.contrastText",
                      borderWidth: "0 2px 2px 0",
                      transform: "rotate(45deg)",
                      pointerEvents: "none",
                    },
                  },
                  "& .editor-underline": { textDecoration: "underline" },
                  "& .editor-strikethrough": { textDecoration: "line-through" },
                  "& .editor-underline-strikethrough": {
                    textDecoration: "underline line-through",
                  },
                  "& a": { color: "primary.main", textDecoration: "underline" },
                  "& code": {
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                    fontSize: "0.88em",
                    bgcolor: "action.hover",
                    px: 0.5,
                    py: "0.1em",
                    borderRadius: "4px",
                  },
                  "& mark": {
                    bgcolor: "warning.light",
                    color: "text.primary",
                    px: 0.25,
                    borderRadius: "2px",
                  },
                  // Keeps a sub/sup from stretching the line it sits on.
                  "& sub, & sup": { fontSize: "0.75em", lineHeight: 0 },
                  "& blockquote": {
                    borderLeft: 3,
                    borderColor: "divider",
                    color: "text.secondary",
                    m: 0,
                    mb: 1.5,
                    pl: 2,
                  },
                }}
              />
            }
            placeholder={
              <Typography
                color="text.secondary"
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  pointerEvents: "none",
                  lineHeight: 1.7,
                  fontSize: "1.02rem",
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
        </Box>
      </LexicalComposer>
    </Box>
  );
}
