import { Fragment, useMemo, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { Plot, PlotItem, PlotRow } from "../models/Plot";
import { store } from "../services/store";
import { PlotBeatCard } from "./PlotBeatCard";

const GUTTER_WIDTH = 136;
const MIN_COLUMN_WIDTH = 280;

/** What a cell is: one plot's slot on one row of the spine. Both halves of a drop need it. */
type CellData = { plotId: string; rowId: string };

/** A cell's droppable id. Neither half is unique on its own — a row spans every column. */
const cellId = (plotId: string, rowId: string) => `${plotId}:${rowId}`;

const rowName = (row: PlotRow, index: number) => row.label || `Row ${index + 1}`;

/**
 * Restricts a drag to the column it started in. A beat belongs to one plot, so
 * moving it into another is not a reorder — filtering the candidates rather than
 * rejecting the drop afterwards means the grid never highlights a cell that would
 * refuse the beat.
 */
const sameColumnOnly: CollisionDetection = (args) => {
  const candidates = args.droppableContainers.filter(
    (container) =>
      (container.data.current as CellData | undefined)?.plotId ===
      (args.active.data.current as CellData | undefined)?.plotId,
  );
  // Overlap first, centres only as a fallback. Rows differ enormously in height —
  // one long beat can make a row four times its neighbour — and `closestCenter`
  // alone measures a card sitting squarely inside a tall row as *further* from it
  // than from the short row it just left, so the drop silently does nothing.
  // Whichever cell the card actually covers is the one the author means.
  const overlapping = rectIntersection({ ...args, droppableContainers: candidates });
  return overlapping.length
    ? overlapping
    : closestCenter({ ...args, droppableContainers: candidates });
};

/**
 * Moves a lifted beat cell by cell within its column. dnd-kit's default getter
 * nudges a fixed 25px per key, which across grid rows of wildly different heights
 * either lands between two cells or skips one outright.
 *
 * It aligns the card's top edge with the target cell's, deliberately keeping the
 * step as short as possible. `KeyboardSensor` scrolls the page instead of moving
 * the card whenever the requested position falls past the scrollport's vertical
 * midpoint, so aiming at a tall row's centre turns every keypress into a scroll
 * that never reaches the row. `sameColumnOnly` resolves the drop by overlap, so
 * a top-aligned card is unambiguously inside the cell it covers.
 */
const cellKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, collisionRect, droppableRects, droppableContainers } },
) => {
  const step = event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
  if (!step || !collisionRect || !active) return;
  event.preventDefault();
  const plotId = (active.data.current as CellData | undefined)?.plotId;
  const cells = droppableContainers
    .toArray()
    .filter((container) => (container.data.current as CellData | undefined)?.plotId === plotId)
    .map((container) => droppableRects.get(container.id))
    .filter((rect): rect is ClientRect => Boolean(rect))
    .sort((a, b) => a.top - b.top);
  // A one-pixel margin, so the cell the card is already aligned with is not
  // mistaken for the one above or below it.
  const next =
    step > 0
      ? cells.find((rect) => rect.top > collisionRect.top + 1)
      : [...cells].reverse().find((rect) => rect.top < collisionRect.top - 1);
  return next ? { x: collisionRect.left, y: next.top } : undefined;
};

/**
 * Two or more of a tome's plots drawn against the shared row axis, so beats that
 * share a row line up and a plot with nothing on a row shows a gap there.
 *
 * The alignment is CSS, not arithmetic: every row's cells are siblings in one
 * grid, so the grid row grows to its tallest card and the others stretch beside
 * it. That is also why the columns cannot each be their own `DndContext` the way
 * `PlotTimeline` instances are — a column's cells are interleaved with every
 * other column's in DOM order, so there is one context for the whole grid and
 * `sameColumnOnly` keeps a beat inside its own plot.
 */
export function PlotGrid({
  rows,
  plots,
  items,
  types,
  elements,
  renderColumnHeader,
  onOpenItem,
  onOpenElement,
  onAddBeat,
  onInsertRow,
  onRenameRow,
  onDeleteRow,
}: {
  /** The tome's spine, in order. */
  rows: PlotRow[];
  /** The plots to draw, left to right. */
  plots: Plot[];
  /** Every beat across those plots; the grid indexes them by cell itself. */
  items: PlotItem[];
  types: ElementType[];
  elements: Element[];
  /** The page owns what sits atop a column — the plot picker, its actions. */
  renderColumnHeader: (plot: Plot) => ReactNode;
  onOpenItem: (item: PlotItem) => void;
  onOpenElement: (element: Element) => void;
  /** Author a new beat in an empty cell. */
  onAddBeat: (plotId: string, rowId: string) => void;
  /** Open a new row at this index of the spine. */
  onInsertRow: (index: number) => void;
  onRenameRow: (row: PlotRow) => void;
  onDeleteRow: (row: PlotRow) => void;
}) {
  const byCell = useMemo(
    () => new Map(items.map((item) => [cellId(item.plotId, item.plotRowId), item])),
    [items],
  );
  const elementsById = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: cellKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const from = active.data.current as CellData | undefined;
    const to = over?.data.current as CellData | undefined;
    if (!from || !to || from.plotId !== to.plotId || from.rowId === to.rowId) return;
    // The store settles what landing on an occupied cell means: the two beats
    // swap rows, since a plot can hold only one beat per row.
    store.movePlotItemToRow(String(active.id), to.rowId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sameColumnOnly}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      {/*
        `overflow-x: auto` computes `overflow-y` to `auto` as well, so this box is
        a scrollport in both directions and clips whatever leaves it. A column
        header's outlined `TextField` floats its shrunk label 9px above the
        field's own top edge, which lands outside the box and gets sliced in half
        without room reserved for it here.
      */}
      <Box sx={{ overflowX: "auto", pt: 1.5, pb: 2 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${plots.length}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`,
            columnGap: 2,
            alignItems: "stretch",
          }}
        >
          <Box sx={{ position: "sticky", left: 0, zIndex: 3, bgcolor: "background.default" }} />
          {plots.map((plot) => (
            <Box
              key={plot.id}
              sx={{ pb: 1.5, borderBottom: 1, borderColor: "divider", minWidth: 0 }}
            >
              {renderColumnHeader(plot)}
            </Box>
          ))}

          {rows.map((row, index) => (
            <Fragment key={row.id}>
              <RowInsert
                label={`Insert a row above ${rowName(row, index)}`}
                onInsert={() => onInsertRow(index)}
              />
              <Box
                sx={{
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  // Opaque on purpose: cards scroll underneath this column.
                  bgcolor: "background.default",
                  py: 1.5,
                  pr: 1,
                  "&:hover .row-action, &:focus-within .row-action": { opacity: 1 },
                }}
              >
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: "block", lineHeight: 1.5, overflowWrap: "anywhere" }}
                >
                  {rowName(row, index)}
                </Typography>
                <Stack direction="row" sx={{ mt: 0.25, ml: -0.5 }}>
                  <Tooltip title="Rename row">
                    <IconButton
                      size="small"
                      className="row-action"
                      aria-label={`Rename ${rowName(row, index)}`}
                      onClick={() => onRenameRow(row)}
                      sx={{ opacity: 0, transition: "opacity 120ms ease" }}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete row">
                    <IconButton
                      size="small"
                      className="row-action"
                      aria-label={`Delete ${rowName(row, index)}`}
                      onClick={() => onDeleteRow(row)}
                      sx={{ opacity: 0, transition: "opacity 120ms ease" }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
              {plots.map((plot) => {
                const item = byCell.get(cellId(plot.id, row.id));
                return item ? (
                  <BeatCell
                    key={plot.id}
                    item={item}
                    types={types}
                    attachments={item.attachedElementIds
                      .map((id) => elementsById.get(id))
                      .filter((element): element is Element => Boolean(element))}
                    onOpen={() => onOpenItem(item)}
                    onOpenElement={onOpenElement}
                  />
                ) : (
                  <EmptyCell
                    key={plot.id}
                    plot={plot}
                    row={row}
                    rowLabel={rowName(row, index)}
                    onAdd={() => onAddBeat(plot.id, row.id)}
                  />
                );
              })}
            </Fragment>
          ))}
          <RowInsert label="Add a row at the end" onInsert={() => onInsertRow(rows.length)} />
        </Box>
      </Box>
    </DndContext>
  );
}

/**
 * The full-width strip between two rows, which reveals a "+" on hover or focus —
 * the same idea as `TimelineConnectorInsert`, turned through ninety degrees. It
 * spans every column because a row belongs to the whole tome, not to one plot.
 */
function RowInsert({ label, onInsert }: { label: string; onInsert: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      onClick={onInsert}
      sx={{
        gridColumn: "1 / -1",
        display: "flex",
        alignItems: "center",
        gap: 1,
        height: 14,
        p: 0,
        border: 0,
        bgcolor: "transparent",
        color: "primary.main",
        cursor: "pointer",
        opacity: 0,
        transition: "opacity 120ms ease",
        "&:hover, &:focus-visible": { opacity: 1 },
      }}
    >
      <Box sx={{ flex: 1, height: "2px", bgcolor: "primary.main", opacity: 0.35 }} />
      <AddIcon fontSize="small" />
      <Box sx={{ flex: 1, height: "2px", bgcolor: "primary.main", opacity: 0.35 }} />
    </Box>
  );
}

/** A cell holding a beat: droppable like every cell, and draggable by its handle. */
function BeatCell({
  item,
  attachments,
  types,
  onOpen,
  onOpenElement,
}: {
  item: PlotItem;
  attachments: Element[];
  types: ElementType[];
  onOpen: () => void;
  onOpenElement: (element: Element) => void;
}) {
  const data: CellData = { plotId: item.plotId, rowId: item.plotRowId };
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: cellId(item.plotId, item.plotRowId),
    data,
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: item.id, data });

  return (
    <Box ref={setDropRef} sx={{ py: 1.5, minWidth: 0, display: "flex" }}>
      <Box
        ref={setDragRef}
        sx={{
          flex: 1,
          minWidth: 0,
          transform: CSS.Translate.toString(transform),
          zIndex: isDragging ? 1 : undefined,
          opacity: isDragging ? 0.65 : 1,
          // A beat swaps with whatever already stands on the row it lands on, so
          // the cell being dropped onto is worth marking even when it is full.
          outline: isOver && !isDragging ? 2 : 0,
          outlineColor: "primary.main",
          outlineOffset: 2,
          borderRadius: 1,
        }}
      >
        <PlotBeatCard
          item={item}
          attachments={attachments}
          types={types}
          onOpen={onOpen}
          onOpenElement={onOpenElement}
          // No label column here and no track — the card carries both itself.
          labelMode="always"
          showDot
          dragHandle={{ attributes, listeners, setActivatorNodeRef }}
        />
      </Box>
    </Box>
  );
}

/** A gap: this plot has nothing on this row. Doubles as the drop target and the place to write one. */
function EmptyCell({
  plot,
  row,
  rowLabel,
  onAdd,
}: {
  plot: Plot;
  row: PlotRow;
  rowLabel: string;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(plot.id, row.id),
    data: { plotId: plot.id, rowId: row.id } satisfies CellData,
  });
  return (
    <Box ref={setNodeRef} sx={{ py: 1.5, minWidth: 0, display: "flex" }}>
      <Box
        component="button"
        type="button"
        aria-label={`Add a beat to ${plot.name} at ${rowLabel}`}
        onClick={onAdd}
        sx={{
          flex: 1,
          minHeight: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 1,
          border: 1,
          borderStyle: "dashed",
          borderColor: isOver ? "primary.main" : "divider",
          bgcolor: isOver ? "action.hover" : "transparent",
          color: "text.disabled",
          cursor: "pointer",
          opacity: isOver ? 1 : 0.55,
          transition: "opacity 120ms ease, border-color 120ms ease",
          "&:hover, &:focus-visible": { opacity: 1, borderColor: "primary.main" },
        }}
      >
        <AddIcon fontSize="small" />
      </Box>
    </Box>
  );
}
