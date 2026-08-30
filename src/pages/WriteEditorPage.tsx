import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Chip, MenuItem, Stack, Typography } from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import type { Element } from "../models/Element";
import type { PlotItem } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { useProseFace } from "../context/ProseFaceContext";
import { useObservable } from "../hooks/useObservable";
import type { SaveState } from "../hooks/autosave";
import { FocusSurface } from "../components/FocusSurface";
import { ProseManuscript } from "../components/ProseManuscript";
import { SaveStatus } from "../components/SaveStatus";

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

  return <WriteFocus key={item.id} item={item} tomeId={tome.id} />;
}

/**
 * One text on the focus surface — the same manuscript the beat view uses, with
 * a single section in it and no rules between parts there are none of.
 */
function WriteFocus({ item, tomeId }: { item: WriteItem; tomeId: string }) {
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const { types } = useTomeWorkspace();
  const { face } = useProseFace();
  const [save, setSave] = useState<{ state: SaveState; retry: () => void }>({
    state: "clean",
    retry: () => {},
  });
  const [words, setWords] = useState(0);
  const [beats, setBeats] = useState<PlotItem[]>([]);
  const flushRef = useRef<Promise<unknown> | null>(null);
  const alive = useRef(true);
  const itemId = item.id;

  const elements =
    useObservable<Element[]>((cb) => store.observeTomeElements(tomeId, cb), [tomeId]) ?? [];

  // A stable array identity, so the manuscript's stored-text memo is not
  // invalidated by every render of this page.
  const items = useMemo(() => [item], [item]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Deferred a tick because StrictMode's dev-only remount runs this cleanup
      // on a page that is about to come straight back; discarding there would
      // delete a draft the author is still looking at. The `alive` ref is set
      // again by the re-run effect before this fires, so only a real unmount
      // discards.
      //
      // The flush is awaited first: it is what turns a draft the author typed
      // into from blank-in-the-database into saved.
      window.setTimeout(async () => {
        await flushRef.current;
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

  const handleSaveState = useCallback(
    (state: SaveState, retry: () => void) => setSave({ state, retry }),
    [],
  );

  // Return to wherever the reader came from (a beat, search, the list). A direct
  // load has no in-app entry to pop, so fall back to the write list.
  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(`/tomes/${tomeId}/write`);
  };

  return (
    <FocusSurface
      onClose={close}
      context={
        beats.length ? (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", overflow: "hidden" }}>
            <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
              Used in
            </Typography>
            {beats.map((beat) => (
              <Chip
                key={beat.id}
                size="small"
                variant="outlined"
                label={beat.title}
                onClick={() => navigate(`/tomes/${tomeId}/plots/${beat.plotId}/items/${beat.id}/write`)}
              />
            ))}
          </Stack>
        ) : null
      }
      status={<SaveStatus state={save.state} savedAt={item.updatedAt} onRetry={save.retry} />}
      footer={
        <Typography variant="caption" color="text.secondary">
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </Typography>
      }
    >
      <ProseManuscript
        items={items}
        elements={elements}
        types={types}
        face={face}
        sectioned={false}
        // A single text opens in the editor, as it always has — there is nothing
        // else on the surface to be reading instead.
        autoActivate={itemId}
        flushRef={flushRef}
        onSaveState={handleSaveState}
        onWordCount={setWords}
        onOpenMention={(elementId) => {
          const element = elements.find((candidate) => candidate.id === elementId);
          if (!element) return;
          navigate(`/tomes/${tomeId}/elements/${element.elementTypeId}/${element.id}/edit`);
        }}
        sectionMenu={(row, closeMenu) => [
          <MenuItem
            key="delete"
            onClick={() => {
              closeMenu();
              confirmAction(
                `Permanently delete "${row.title.trim() || "this text"}"? This cannot be undone.`,
                async () => {
                  await store.deleteWriteItem(row.id);
                  navigate(`/tomes/${tomeId}/write`);
                },
              );
            }}
          >
            <DeleteOutlinedIcon fontSize="small" sx={{ mr: 1.5, color: "error.main" }} />
            Delete text permanently
          </MenuItem>,
        ]}
      />
    </FocusSurface>
  );
}
