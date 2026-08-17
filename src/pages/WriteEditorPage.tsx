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
import { MENTION_ATTRIBUTE } from "../lexical/MentionNode";
import { MentionNode } from "../lexical/MentionNode";
import { WriteItemTypeIcon } from "../components/WriteItemTypeIcon";

/** How long typing pauses before the autosave fires. */
const AUTOSAVE_MS = 600;

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
  const saveTimer = useRef<number>(undefined);
  const dirty = useRef(false);
  const alive = useRef(true);
  const itemId = item.id;

  const scheduleSave = () => {
    dirty.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      dirty.current = false;
      store.saveWriteItem({ id: itemId, ...latest.current });
    }, AUTOSAVE_MS);
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(saveTimer.current);
      // Deferred a tick because StrictMode's dev-only remount runs this cleanup
      // on a page that is about to come straight back; discarding there would
      // delete a draft the author is still looking at. A real unmount leaves
      // `alive` false and the discard goes through.
      window.setTimeout(async () => {
        if (dirty.current) {
          dirty.current = false;
          await store.saveWriteItem({ id: itemId, ...latest.current });
        }
        if (!alive.current) await store.discardWriteItemIfBlank(itemId);
      }, 0);
    };
  }, [itemId]);

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
      onError: (error: Error) => console.error(error),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = (editorState: EditorState) => {
    const preview = editorState.read(() => $getRoot().getTextContent());
    latest.current = {
      ...latest.current,
      content: JSON.stringify(editorState),
      preview,
    };
    scheduleSave();
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
          onClick={() => navigate(`/tomes/${tomeId}/write`)}
          sx={{ alignSelf: "flex-start", flexShrink: 0 }}
        >
          All text
        </Button>
        <Box sx={{ flex: 1 }} />
        <TextField
          select
          size="small"
          label="Type"
          value={type}
          onChange={(event) => {
            const next = event.target.value as WriteItemType;
            setType(next);
            latest.current = { ...latest.current, type: next };
            scheduleSave();
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
                // recreating fields on a deleted id.
                window.clearTimeout(saveTimer.current);
                dirty.current = false;
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
          scheduleSave();
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
        <Box
          onClick={handleMentionClick}
          sx={{
            position: "relative",
            flex: 1,
            mt: 2,
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
                  "& h1, & h2, & h3": { mt: 2.5, mb: 1 },
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
          <LinkPlugin />
          <OnChangePlugin onChange={handleChange} />
          <MentionsPlugin elements={elements} types={types} />
        </Box>
      </LexicalComposer>
    </Box>
  );
}
