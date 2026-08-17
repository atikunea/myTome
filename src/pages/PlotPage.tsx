import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Box, Button, Stack, Typography } from "@mui/material";
import Timeline from "@mui/lab/Timeline";
import { timelineOppositeContentClasses } from "@mui/lab/TimelineOppositeContent";
import AddIcon from "@mui/icons-material/Add";
import type { Element } from "../models/Element";
import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { EmptyState } from "../components/EmptyState";
import { TimelineCard } from "../components/TimelineCard";
import { PlotItemDialog } from "../components/PlotItemDialog";
import { PlotPicker } from "../components/PlotPicker";

export function PlotPage({ creating = false }: { creating?: boolean }) {
  const { plotId, itemId, index } = useParams<{
    plotId?: string;
    itemId?: string;
    index?: string;
  }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();

  const plots = useObservable<Plot[]>((cb) => store.observePlots(tome!.id, cb), [tome?.id]);
  const items =
    useObservable<PlotItem[]>(
      (cb) => store.observePlotItems(plotId ?? "", cb),
      [plotId],
    ) ?? [];
  const elements =
    useObservable<Element[]>((cb) => store.observeTomeElements(tome!.id, cb), [tome?.id]) ?? [];
  const writeItems =
    useObservable<WriteItem[]>((cb) => store.observeWriteItems(tome!.id, cb), [tome?.id]) ?? [];

  // The live query is the source of truth, but a drag needs an immediate answer, so
  // the rendered order is held locally and re-seeded whenever the stored set changes.
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const storedKey = items.map((item) => item.id).join("|");
  useEffect(() => {
    setOrderedIds((current) => {
      const stored = storedKey ? storedKey.split("|") : [];
      const sameSet =
        current.length === stored.length && current.every((id) => stored.includes(id));
      // An echo of an order this page already applied must not stomp it.
      return sameSet ? current : stored;
    });
  }, [storedKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const elementsById = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );
  const cards = orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is PlotItem => Boolean(item));

  // No :plotId in the URL — resolve the tome's first plot, creating one if needed.
  useEffect(() => {
    if (plotId || !tome || !plots) return;
    let active = true;
    store.ensureDefaultPlot(tome.id).then((plot) => {
      if (active) navigate(`/tomes/${tome.id}/plots/${plot.id}`, { replace: true });
    });
    return () => {
      active = false;
    };
  }, [plotId, tome, plots, navigate]);

  if (!tome) return null;
  const plot = plots?.find((p) => p.id === plotId);
  if (!plotId || !plots) return null;
  if (!plot)
    return (
      <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
        Plot not found
      </Typography>
    );

  const plotPath = `/tomes/${tome.id}/plots/${plot.id}`;
  const closeDialog = () => navigate(plotPath);
  const insertAt = creating && index !== undefined ? Number(index) : undefined;
  const editingItem = itemId ? byId.get(itemId) : undefined;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedIds.indexOf(String(active.id));
    const to = orderedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(orderedIds, from, to);
    setOrderedIds(next);
    store.reorderPlotItems(plot.id, next);
  };

  return (
    <Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, gap: 2, mb: 3.25 }}
      >
        <Box>
          <Typography
            variant="overline"
            color="primary"
            sx={{ fontWeight: 800, letterSpacing: "0.12em" }}
          >
            PLOT
          </Typography>
          <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
            {plot.name}
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => navigate(`${plotPath}/insert/${cards.length}`)}>
          Add item
        </Button>
      </Stack>

      <PlotPicker tome={tome} plots={plots} current={plot} />

      {cards.length ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            <Timeline
              position="right"
              sx={{
                px: 0,
                // Below `sm` the spine column would eat a quarter of the width, so it
                // is dropped and each card shows its own label instead (TimelineCard).
                [`& .${timelineOppositeContentClasses.root}`]: {
                  flex: 0.2,
                  minWidth: 90,
                  display: { xs: "none", sm: "block" },
                },
              }}
            >
              {cards.map((item, position) => (
                <TimelineCard
                  key={item.id}
                  item={item}
                  types={types}
                  attachments={item.attachedElementIds
                    .map((id) => elementsById.get(id))
                    .filter((element): element is Element => Boolean(element))}
                  onOpen={() => navigate(`${plotPath}/items/${item.id}`)}
                  onInsertAbove={() => navigate(`${plotPath}/insert/${position}`)}
                  onInsertBelow={() => navigate(`${plotPath}/insert/${position + 1}`)}
                  onOpenElement={(element) =>
                    navigate(`/tomes/${tome.id}/elements/${element.elementTypeId}/${element.id}/edit`)
                  }
                />
              ))}
            </Timeline>
          </SortableContext>
        </DndContext>
      ) : (
        <EmptyState
          title="Start your outline"
          body="Add the first beat, chapter, or turning point in this plot."
        />
      )}

      <PlotItemDialog
        open={Boolean(editingItem) || insertAt !== undefined}
        item={editingItem}
        insertAt={insertAt}
        tomeId={tome.id}
        plotId={plot.id}
        elements={elements}
        types={types}
        writeItems={writeItems}
        onOpenWriteItem={(writeItemId) =>
          navigate(`/tomes/${tome.id}/write/${writeItemId}`)
        }
        onClose={closeDialog}
      />
    </Box>
  );
}
