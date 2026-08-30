import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CheckIcon from "@mui/icons-material/Check";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import {
  untitledWriteItem,
  writeItemTypeLabels,
  writeItemTypes,
} from "../models/WriteItem";
import type { SaveState } from "../hooks/autosave";
import { blocksText, countWords, lexicalToBlocks } from "../lexical/blocks";
import { MENTION_ATTRIBUTE } from "../lexical/MentionNode";
import { StaticProse } from "./StaticProse";
import { WriteItemTypeIcon } from "./WriteItemTypeIcon";
import { ProseEditor, type CaretPoint, type ProseEdit } from "./ProseEditor";
import { manuscriptSx, proseFontFamily, type ProseFace } from "./manuscriptStyles";

type Draft = { title: string; type: WriteItemType };

/**
 * A beat's composed writing, drawn as one continuous manuscript in reading
 * order — and, for a single text, the same surface with one section in it.
 *
 * Every section is static markup until it is clicked; the clicked one becomes
 * the surface's single live editor (`ProseEditor`) and the previous one goes
 * back to markup. The switch is ordered so nothing is lost or misattributed:
 *
 * 1. the outgoing editor's unmount flushes its own pending write, closing over
 *    its own values, so a debounce in flight can never land on the row the
 *    author moved to;
 * 2. the outgoing section is redrawn from `edits` — the text that editor last
 *    held — rather than from the stored row, because the write and its
 *    `liveQuery` echo are not synchronous and a re-read would flash the
 *    pre-edit text for a frame;
 * 3. the incoming editor mounts keyed by id and resolves the caret against the
 *    click point.
 */
export function ProseManuscript({
  items,
  elements,
  types,
  face,
  sectioned,
  sectionMenu,
  autoActivate,
  flushRef,
  onSaveState,
  onWordCount,
  onOpenMention,
}: {
  items: WriteItem[];
  elements: Element[];
  types: ElementType[];
  face: ProseFace;
  /**
   * A multi-part beat: mark the mounted section, and demote each title to a
   * label on its section rule instead of a heading over the prose.
   */
  sectioned: boolean;
  /** Extra overflow items — what "remove" and "delete" mean is the page's business. */
  sectionMenu?: (item: WriteItem, close: () => void) => ReactNode;
  /**
   * A section to open straight into rather than leave as markup — the only text
   * on a single-text surface, or a draft the author has just added to a beat.
   * Acted on once per id, so a later live-query emit cannot yank the author back
   * to a section they have since left.
   */
  autoActivate?: string | null;
  /**
   * Receives the mounted editor's unmount flush. A page that sweeps blank
   * drafts on close has to await this first, or a draft the author typed into
   * would still look blank in the database and be deleted.
   */
  flushRef?: MutableRefObject<Promise<unknown> | null>;
  onSaveState: (state: SaveState, retry: () => void) => void;
  onWordCount: (words: number) => void;
  onOpenMention: (elementId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [caretPoint, setCaretPoint] = useState<CaretPoint | null>(null);
  // What each editor last held, so a section redrawn after its editor unmounts
  // shows the author's text rather than the row as it stood one debounce ago.
  const [edits, setEdits] = useState<Record<string, ProseEdit>>({});
  // Title and type of the section being edited. They belong to the same row as
  // the document and ride its debounce, so `ProseEditor` takes them as props.
  const [draft, setDraft] = useState<Draft | null>(null);

  // A section that disappears underneath us — deleted, or detached from the
  // beat — must not leave the surface pointing at nothing.
  useEffect(() => {
    if (activeId && !items.some((item) => item.id === activeId)) {
      setActiveId(null);
      setDraft(null);
    }
  }, [items, activeId]);

  useEffect(() => {
    if (!activeId) onSaveState("clean", () => {});
  }, [activeId, onSaveState]);

  // Seeding the draft is done beside the state updates rather than inside a
  // `setActiveId` updater: React invokes updaters twice under StrictMode, and
  // they have to stay pure.
  const activate = useCallback(
    (item: WriteItem, point: CaretPoint | null) => {
      if (item.id !== activeId) setDraft({ title: item.title, type: item.type });
      setActiveId(item.id);
      setCaretPoint(point);
    },
    [activeId],
  );

  /** Changing the type enters the section: it is an edit to that row like any other. */
  const changeType = useCallback(
    (item: WriteItem, type: WriteItemType) => {
      setActiveId(item.id);
      setCaretPoint(null);
      setDraft((current) =>
        current && item.id === activeId ? { ...current, type } : { title: item.title, type },
      );
    },
    [activeId],
  );

  const autoActivated = useRef<string | null>(null);
  useEffect(() => {
    if (!autoActivate || autoActivated.current === autoActivate) return;
    const item = items.find((candidate) => candidate.id === autoActivate);
    if (!item) return;
    autoActivated.current = autoActivate;
    activate(item, null);
  }, [autoActivate, items, activate]);

  const handleEdit = useCallback((id: string, edit: ProseEdit) => {
    setEdits((current) => ({ ...current, [id]: edit }));
  }, []);

  // Text of the *stored* rows, recomputed only when a live query emits. The
  // active section's live text comes from `edits`, so typing never reparses its
  // neighbours.
  const storedText = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => [item.id, blocksText(lexicalToBlocks(item.content))]),
      ),
    [items],
  );

  const words = useMemo(
    () =>
      items.reduce(
        (total, item) => total + countWords(edits[item.id]?.text ?? storedText[item.id] ?? ""),
        0,
      ),
    [items, edits, storedText],
  );

  useEffect(() => {
    onWordCount(words);
  }, [words, onWordCount]);

  /**
   * Mentions are plain DOM in both renders — Lexical builds them in the editor,
   * `StaticProse` reproduces them — so one delegated handler serves the whole
   * manuscript rather than being wired per node. An id that resolves to nothing
   * is inert: deleting an element does not scrub mentions of it from prose.
   */
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    const mention = (event.target as HTMLElement).closest?.(`[${MENTION_ATTRIBUTE}]`);
    if (!mention) return;
    event.preventDefault();
    event.stopPropagation();
    const elementId = mention.getAttribute(MENTION_ATTRIBUTE);
    if (elementId) onOpenMention(elementId);
  };

  return (
    <Box onClick={handleClick}>
      {items.map((item, index) => (
        <ManuscriptSection
          key={item.id}
          item={item}
          content={edits[item.id]?.content ?? item.content}
          face={face}
          elements={elements}
          types={types}
          sectioned={sectioned}
          first={index === 0}
          active={item.id === activeId}
          draft={item.id === activeId ? draft : null}
          caretPoint={item.id === activeId ? caretPoint : null}
          extraMenu={sectionMenu}
          flushRef={flushRef}
          onActivate={activate}
          onChangeType={changeType}
          onChangeTitle={(title) => setDraft((current) => (current ? { ...current, title } : null))}
          onEdit={handleEdit}
          onSaveState={onSaveState}
        />
      ))}
    </Box>
  );
}

function ManuscriptSection({
  item,
  content,
  face,
  elements,
  types,
  sectioned,
  first,
  active,
  draft,
  caretPoint,
  extraMenu,
  flushRef,
  onActivate,
  onChangeType,
  onChangeTitle,
  onEdit,
  onSaveState,
}: {
  item: WriteItem;
  content: string;
  face: ProseFace;
  elements: Element[];
  types: ElementType[];
  sectioned: boolean;
  first: boolean;
  active: boolean;
  draft: Draft | null;
  caretPoint: CaretPoint | null;
  extraMenu?: (item: WriteItem, close: () => void) => ReactNode;
  flushRef?: MutableRefObject<Promise<unknown> | null>;
  onActivate: (item: WriteItem, point: CaretPoint | null) => void;
  onChangeType: (item: WriteItem, type: WriteItemType) => void;
  onChangeTitle: (title: string) => void;
  onEdit: (id: string, edit: ProseEdit) => void;
  onSaveState: (state: SaveState, retry: () => void) => void;
}) {
  const title = draft ? draft.title : item.title;
  const type = draft ? draft.type : item.type;

  const handleEdit = useCallback((edit: ProseEdit) => onEdit(item.id, edit), [onEdit, item.id]);

  /**
   * Clicking anywhere in the static prose enters the section at that point.
   * Links are left to the browser and mentions to the manuscript's delegated
   * handler above — neither should turn into an edit.
   */
  const handleBodyClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest?.("a") || target.closest?.(`[${MENTION_ATTRIBUTE}]`)) return;
    onActivate(item, { x: event.clientX, y: event.clientY });
  };

  /**
   * The section title is furniture, not prose. Given its own line at prose size
   * and in the prose face it reads as text to be read — the eye starts on it,
   * realises it is a label, and stops, which is exactly the break a continuous
   * manuscript cannot afford between every section. So on a beat it folds into
   * the section's own rule beside the kind label: small, in the UI face, and
   * sized to its own text so a short title leaves the rest of the line to the
   * divider.
   *
   * The single-text surface keeps it as the page's heading. There is one
   * document there and no flow to interrupt, and it is the only place the
   * text's name appears.
   *
   * It stays a live `TextField` in both, rather than becoming static markup
   * that swaps on click, so the focus contract below still holds.
   */
  const titleField = (
    <TextField
      variant="standard"
      placeholder={untitledWriteItem}
      value={title}
      // Focus alone enters the section: a readOnly field still takes focus, so
      // the first keystroke after tabbing or tapping in lands on a live editor
      // rather than being swallowed.
      onFocus={() => onActivate(item, null)}
      onChange={(event) => onChangeTitle(event.target.value)}
      slotProps={{
        input: {
          readOnly: !active,
          // A beat's titles never take an underline, active or not. The section
          // already says it is live — the gutter rule, the coloured kind label,
          // the title darkening — and a rule under one title part-way down a
          // continuous manuscript reads as a break in the page. The single-text
          // surface keeps it: there the title is the document heading, and
          // nothing else on the page marks it as a field.
          disableUnderline: sectioned || !active,
          sx: sectioned
            ? {
                fontSize: "0.8125rem",
                fontWeight: 600,
                lineHeight: 1.6,
                color: active ? "text.primary" : "text.secondary",
                py: 0,
                // A title too long for the room it has left ends in an ellipsis
                // rather than a hard clip. Browsers drop it while the field has
                // focus, which is right: the author is reading it by caret then.
                "& input": { textOverflow: "ellipsis" },
              }
            : {
                fontFamily: proseFontFamily(face),
                fontSize: "1.9rem",
                fontWeight: 600,
                letterSpacing: "-0.015em",
                lineHeight: 1.25,
                py: 0.25,
              },
        },
        // Width in characters, which grows as the title is typed. Nothing here
        // depends on `active`: the header must be the same height and the prose
        // in the same place before and after a click, or the caret resolves
        // against text that has moved.
        htmlInput: sectioned
          ? { size: Math.max(title.length, untitledWriteItem.length) }
          : undefined,
      }}
      fullWidth={!sectioned}
      sx={sectioned ? { flex: "0 1 auto", minWidth: 0 } : { mb: 1.5 }}
    />
  );

  return (
    <Box
      component="section"
      sx={{
        mt: first ? 0 : 5,
        position: "relative",
        // The mounted section is marked by a rule rather than by dimming its
        // neighbours: the rest of the manuscript is prose to be read, not a
        // preview of it.
        //
        // Drawn as a pseudo-element in the gutter rather than as a real border,
        // for two reasons: it cannot move the prose by even a pixel when a
        // section is entered, which is the whole premise of the swap; and it
        // sits at a fixed inset from the column, so it stays on screen at a
        // phone width where the surface's own padding is only 20px.
        ...(sectioned && active
          ? {
              "&::before": {
                content: '""',
                position: "absolute",
                left: { xs: -10, sm: -18 },
                top: 0,
                bottom: 0,
                width: 3,
                borderRadius: 2,
                bgcolor: "primary.main",
              },
            }
          : {}),
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ alignItems: "center", mb: sectioned ? 1.5 : 0.75 }}
      >
        <Typography
          variant="overline"
          sx={{
            color: active ? "primary.main" : "text.disabled",
            lineHeight: 1.6,
            flexShrink: 0,
          }}
        >
          {writeItemTypeLabels[type]}
        </Typography>
        {sectioned ? titleField : null}
        {sectioned ? (
          <Divider sx={{ flex: "1 1 auto", minWidth: 16 }} />
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        <SectionMenu
          item={item}
          type={type}
          onChangeType={onChangeType}
          extraMenu={extraMenu}
        />
      </Stack>

      {sectioned ? null : titleField}

      {active ? (
        <ProseEditor
          // Keyed by id so switching sections rebuilds the editor on the new
          // document; a live re-emit of the same row must not.
          key={item.id}
          itemId={item.id}
          title={title}
          type={type}
          content={content}
          face={face}
          elements={elements}
          types={types}
          caretPoint={caretPoint}
          flushRef={flushRef}
          onEdit={handleEdit}
          onSaveState={onSaveState}
        />
      ) : (
        <Box
          role="button"
          tabIndex={0}
          aria-label={`Edit ${item.title.trim() || untitledWriteItem}`}
          onClick={handleBodyClick}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onActivate(item, null);
          }}
          sx={{
            position: "relative",
            cursor: "text",
            borderRadius: 2,
            // A generous hit area that moves nothing: the padding is cancelled
            // by an equal negative margin, so the static block occupies exactly
            // the space the editor will.
            p: 1.5,
            m: -1.5,
            "&:hover": { bgcolor: "action.hover" },
            "&:hover .edit-hint": { opacity: 1 },
            "&:focus-visible": {
              outline: 2,
              outlineColor: "primary.main",
              outlineOffset: 2,
            },
            ...manuscriptSx(face),
          }}
        >
          <StaticSectionBody content={content} />
          <Stack
            className="edit-hint"
            direction="row"
            spacing={0.5}
            sx={{
              position: "absolute",
              top: 2,
              right: 2,
              alignItems: "center",
              color: "primary.main",
              opacity: 0,
              transition: "opacity 120ms ease",
              pointerEvents: "none",
            }}
          >
            <EditOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Click to edit
            </Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

/**
 * Memoized on the content string alone, so typing in one section does not
 * reparse the Lexical JSON of every other section on the surface.
 */
const StaticSectionBody = memo(function StaticSectionBody({ content }: { content: string }) {
  const blocks = useMemo(() => lexicalToBlocks(content), [content]);
  return <StaticProse blocks={blocks} />;
});

function SectionMenu({
  item,
  type,
  onChangeType,
  extraMenu,
}: {
  item: WriteItem;
  type: WriteItemType;
  onChangeType: (item: WriteItem, type: WriteItemType) => void;
  extraMenu?: (item: WriteItem, close: () => void) => ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);

  return (
    <>
      <IconButton
        size="small"
        aria-label={`Options for ${item.title.trim() || untitledWriteItem}`}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(event.currentTarget);
        }}
      >
        <MoreHorizIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ px: 2, display: "block", lineHeight: 2.2 }}
        >
          Kind of text
        </Typography>
        {writeItemTypes.map((option) => (
          <MenuItem
            key={option}
            dense
            selected={option === type}
            onClick={() => {
              onChangeType(item, option);
              close();
            }}
          >
            <ListItemIcon>
              {option === type ? (
                <CheckIcon fontSize="small" />
              ) : (
                <WriteItemTypeIcon type={option} fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText>{writeItemTypeLabels[option]}</ListItemText>
          </MenuItem>
        ))}
        {extraMenu ? <Divider /> : null}
        {extraMenu?.(item, close)}
      </Menu>
    </>
  );
}
