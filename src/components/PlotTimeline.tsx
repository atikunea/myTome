import { useEffect, useMemo, useState } from "react";
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
import Timeline from "@mui/lab/Timeline";
import { timelineOppositeContentClasses } from "@mui/lab/TimelineOppositeContent";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { PlotItem } from "../models/Plot";
import { store } from "../services/store";
import { EmptyState } from "./EmptyState";
import { TimelineCard } from "./TimelineCard";

/**
 * One plot drawn as a sortable timeline, including its own drag context and
 * empty state. Ordering lives here rather than in the page so that two of these
 * can sit side by side (`PlotComparePage`) without sharing a drag session: each
 * instance owns a `DndContext`, so a card can only be dropped in its own plot.
 */
export function PlotTimeline({
  plotId,
  items,
  types,
  elements,
  onOpenItem,
  onInsert,
  onOpenElement,
}: {
  plotId: string;
  /** The plot's items in stored order. */
  items: PlotItem[];
  types: ElementType[];
  elements: Element[];
  onOpenItem: (item: PlotItem) => void;
  /** Create an item at this index within the plot. */
  onInsert: (index: number) => void;
  onOpenElement: (element: Element) => void;
}) {
  // The live query is the source of truth, but a drag needs an immediate answer, so
  // the rendered order is held locally and re-seeded whenever the stored set changes.
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const storedKey = items.map((item) => item.id).join("|");
  useEffect(() => {
    setOrderedIds((current) => {
      const stored = storedKey ? storedKey.split("|") : [];
      const sameSet =
        current.length === stored.length && current.every((id) => stored.includes(id));
      // An echo of an order this component already applied must not stomp it.
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedIds.indexOf(String(active.id));
    const to = orderedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(orderedIds, from, to);
    setOrderedIds(next);
    store.reorderPlotItems(plotId, next);
  };

  if (!cards.length)
    return (
      <EmptyState
        title="Start your outline"
        body="Add the first beat, chapter, or turning point in this plot."
      />
    );

  return (
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
              onOpen={() => onOpenItem(item)}
              onInsertAbove={() => onInsert(position)}
              onInsertBelow={() => onInsert(position + 1)}
              onOpenElement={onOpenElement}
            />
          ))}
        </Timeline>
      </SortableContext>
    </DndContext>
  );
}
