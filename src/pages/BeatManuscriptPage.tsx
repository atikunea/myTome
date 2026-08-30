import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import TimelineIcon from "@mui/icons-material/Timeline";
import type { Element } from "../models/Element";
import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import { writeItemTypeLabels, writeItemTypes } from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { useProseFace } from "../context/ProseFaceContext";
import { useObservable } from "../hooks/useObservable";
import type { SaveState } from "../hooks/autosave";
import { FocusSurface } from "../components/FocusSurface";
import { ProseManuscript } from "../components/ProseManuscript";
import { SaveStatus } from "../components/SaveStatus";
import { WriteItemTypeIcon } from "../components/WriteItemTypeIcon";

/**
 * A beat's composed text, read and written as one continuous manuscript.
 *
 * This is the surface that closes the old dead end: clicking a composed row in
 * `PlotItemDialog` used to navigate away to a page that had forgotten which
 * beat it belonged to, and the dialog had to persist the composition on the way
 * out to avoid losing an unsaved reorder. The beat is named on screen here, and
 * composition is edited beside the prose rather than in a form.
 *
 * There is one route for this regardless of where the author came from —
 * `plots/:plotId/items/:itemId/write` — rather than a second variant under
 * `plots/compare/...`. The compare view links to the same place and the back
 * button returns there, so a beat's manuscript has one address.
 */
export function BeatManuscriptPage() {
  const { plotId, itemId } = useParams<{ plotId: string; itemId: string }>();
  const { tome } = useTomeWorkspace();

  const beat = useObservable<PlotItem | null>(
    (cb) => store.observePlotItem(itemId!, cb),
    [itemId],
  );

  if (!tome || beat === undefined) return null;
  if (beat === null)
    return (
      <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
        That beat no longer exists
      </Typography>
    );

  return <BeatFocus beat={beat} tomeId={tome.id} plotId={plotId ?? beat.plotId} />;
}

function BeatFocus({
  beat,
  tomeId,
  plotId,
}: {
  beat: PlotItem;
  tomeId: string;
  plotId: string;
}) {
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const { types } = useTomeWorkspace();
  const { face } = useProseFace();
  const [save, setSave] = useState<{ state: SaveState; retry: () => void }>({
    state: "clean",
    retry: () => {},
  });
  const [words, setWords] = useState(0);
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);
  // A text just added to the beat opens in the editor; everything else on the
  // surface stays prose to be read until it is clicked.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const flushRef = useRef<Promise<unknown> | null>(null);
  const alive = useRef(true);
  // Only drafts started *here* are swept on close. A blank section that was
  // already composed into the beat is the author's, not an abandoned "New".
  const created = useRef<string[]>([]);

  const plot = useObservable<Plot | undefined>(
    (cb) => store.observePlot(plotId, cb),
    [plotId],
  );
  const elements =
    useObservable<Element[]>((cb) => store.observeTomeElements(tomeId, cb), [tomeId]) ?? [];
  const writeItems =
    useObservable<WriteItem[]>((cb) => store.observeWriteItems(tomeId, cb), [tomeId]) ?? [];

  /** The beat's text in reading order. `writeItemIds` is the order; this resolves it. */
  const items = useMemo(() => {
    const byId = new Map(writeItems.map((row) => [row.id, row]));
    return beat.writeItemIds
      .map((id) => byId.get(id))
      .filter((row): row is WriteItem => Boolean(row));
  }, [beat.writeItemIds, writeItems]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Same shape as the single-text surface: deferred a tick so StrictMode's
      // dev-only remount cannot discard a draft the author is still looking at,
      // and after the mounted editor's flush so a draft that *was* typed into is
      // no longer blank by the time it is examined.
      const ids = created.current;
      window.setTimeout(async () => {
        await flushRef.current;
        if (!alive.current)
          for (const id of ids) await store.discardWriteItemIfBlank(id);
      }, 0);
    };
  }, []);

  const handleSaveState = useCallback(
    (state: SaveState, retry: () => void) => setSave({ state, retry }),
    [],
  );

  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(`/tomes/${tomeId}/plots/${plotId}`);
  };

  const addText = async (type: WriteItemType) => {
    setAddMenu(null);
    const draft = await store.createDraftWriteItem(tomeId, type, beat.id);
    created.current = [...created.current, draft.id];
    setJustAdded(draft.id);
  };

  /**
   * Reordering lives in the overflow menu rather than on drag handles. Dragging
   * a section of a scrolling manuscript whose rows differ hugely in height is a
   * far bigger piece of work than the handful of parts a beat holds justifies —
   * and unlike a drag, this is reachable from the keyboard for free.
   */
  const move = async (row: WriteItem, delta: number) => {
    const order = [...beat.writeItemIds];
    const from = order.indexOf(row.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, ...order.splice(from, 1));
    await store.setPlotItemWriteItems(beat.id, order);
  };

  const removeFromBeat = (row: WriteItem) =>
    store.setPlotItemWriteItems(
      beat.id,
      beat.writeItemIds.filter((id) => id !== row.id),
    );

  return (
    <FocusSurface
      onClose={close}
      context={
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
          <TimelineIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          <Typography variant="body2" color="text.secondary" noWrap>
            {plot?.name ?? "Plot"}
            {beat.name ? ` · ${beat.name}` : ""}
          </Typography>
          <Typography variant="body2" color="text.disabled">
            /
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {beat.title}
          </Typography>
        </Stack>
      }
      status={<SaveStatus state={save.state} savedAt={beat.updatedAt} onRetry={save.retry} />}
      menu={(closeMenu) => [
        <MenuItem
          key="beat"
          onClick={() => {
            closeMenu();
            navigate(`/tomes/${tomeId}/plots/${plotId}/items/${beat.id}`);
          }}
        >
          <TimelineIcon fontSize="small" sx={{ mr: 1.5, color: "text.secondary" }} />
          Beat details…
        </MenuItem>,
      ]}
      footer={
        <Typography variant="caption" color="text.secondary">
          {items.length} {items.length === 1 ? "text" : "texts"} ·{" "}
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </Typography>
      }
    >
      {items.length ? (
        <ProseManuscript
          items={items}
          elements={elements}
          types={types}
          face={face}
          sectioned
          autoActivate={justAdded}
          flushRef={flushRef}
          onSaveState={handleSaveState}
          onWordCount={setWords}
          onOpenMention={(elementId) => {
            const element = elements.find((candidate) => candidate.id === elementId);
            if (!element) return;
            navigate(`/tomes/${tomeId}/elements/${element.elementTypeId}/${element.id}/edit`);
          }}
          sectionMenu={(row, closeMenu) => {
            const index = beat.writeItemIds.indexOf(row.id);
            return [
              <MenuItem
                key="up"
                disabled={index <= 0}
                onClick={() => {
                  closeMenu();
                  void move(row, -1);
                }}
              >
                <ArrowUpwardIcon fontSize="small" sx={{ mr: 1.5, color: "text.secondary" }} />
                Move earlier
              </MenuItem>,
              <MenuItem
                key="down"
                disabled={index < 0 || index >= beat.writeItemIds.length - 1}
                onClick={() => {
                  closeMenu();
                  void move(row, 1);
                }}
              >
                <ArrowDownwardIcon fontSize="small" sx={{ mr: 1.5, color: "text.secondary" }} />
                Move later
              </MenuItem>,
              <Divider key="divider" />,
              <MenuItem
                key="remove"
                onClick={() => {
                  closeMenu();
                  void removeFromBeat(row);
                }}
              >
                <LinkOffIcon fontSize="small" sx={{ mr: 1.5, color: "text.secondary" }} />
                Remove from this beat
              </MenuItem>,
              <MenuItem
                key="delete"
                onClick={() => {
                  closeMenu();
                  confirmAction(
                    `Permanently delete "${row.title.trim() || "this text"}"? It will be removed from every beat that composes it, and this cannot be undone.`,
                    () => store.deleteWriteItem(row.id),
                  );
                }}
              >
                <DeleteOutlinedIcon fontSize="small" sx={{ mr: 1.5, color: "error.main" }} />
                Delete text permanently
              </MenuItem>,
            ];
          }}
        />
      ) : (
        <Box sx={{ py: 6, textAlign: "center" }}>
          <Typography variant="h2" sx={{ fontSize: "1.4rem", mb: 1 }}>
            Nothing written for this beat yet
          </Typography>
          <Typography color="text.secondary">
            Add a passage, a chapter, or a snippet to start.
          </Typography>
        </Box>
      )}

      <Stack direction="row" sx={{ justifyContent: "center", mt: 5 }}>
        <Button
          variant={items.length ? "outlined" : "contained"}
          startIcon={<AddIcon />}
          endIcon={<ArrowDropDownIcon />}
          onClick={(event) => setAddMenu(event.currentTarget)}
        >
          Add text to this beat
        </Button>
        <Menu anchorEl={addMenu} open={Boolean(addMenu)} onClose={() => setAddMenu(null)}>
          {writeItemTypes.map((type) => (
            <MenuItem key={type} onClick={() => void addText(type)}>
              <WriteItemTypeIcon
                type={type}
                fontSize="small"
                sx={{ mr: 1.25, color: "text.secondary" }}
              />
              {writeItemTypeLabels[type]}
            </MenuItem>
          ))}
        </Menu>
      </Stack>
    </FocusSurface>
  );
}
