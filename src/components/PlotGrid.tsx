import { Fragment, useMemo, useState, type ReactNode } from "react";
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
import { arrayMove } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import { plotRowName, type Plot, type PlotItem, type PlotRow } from "../models/Plot";
import { store } from "../services/store";
import { useConfirm } from "../context/ConfirmContext";
import { BeatDot } from "./BeatDot";
import { EmptyState } from "./EmptyState";
import { PlotBeatCard } from "./PlotBeatCard";

const GUTTER_WIDTH = 136;
/** Below `sm` the gutter has to give way, or one column will not fit a phone. */
const GUTTER_WIDTH_XS = 76;
/**
 * A column's floor, which only bites when there are several: one column is a
 * `1fr` that fills whatever is left. It has to drop below `sm` all the same —
 * 136 + 280 overflows a 375px phone by a hair, and a single plot that has to be
 * nudged sideways to be read is worse than the timeline this replaced.
 */
const MIN_COLUMN_WIDTH = 280;
const MIN_COLUMN_WIDTH_XS = 180;
/** Wide enough for a dot around an icon (28px), so the track never bends. */
const TRACK_WIDTH = 36;
/** Height of the hover-to-insert strip between two rows; the track bridges it. */
const INSERT_STRIP = 14;
/**
 * How many rows nobody is standing on before they collapse to a single line.
 * Two is a gap worth looking at — and worth dropping a beat into. Three is
 * scrolling, which is what a single plot against a deep spine would otherwise be.
 */
const QUIET_RUN_MIN = 3;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What a cell is: one plot's slot on one row of the spine. Both halves of a drop need it. */
type CellData = { plotId: string; rowId: string };

/** A cell's droppable id. Neither half is unique on its own — a row spans every column. */
const cellId = (plotId: string, rowId: string) => `${plotId}:${rowId}`;

/** A drawn row: one spine row, or a collapsed run of quiet ones. */
type GridEntry =
  | { kind: "row"; row: PlotRow; index: number }
  | { kind: "quiet"; rows: PlotRow[]; index: number };

/** The stretch of spine a plot covers, as ranks. Outside it the plot has no track. */
type Span = { first: number; last: number };

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
 * A tome's plots — one of them, or all of them — drawn against the shared row
 * axis, so beats that share a row line up and a plot with nothing on a row shows
 * a gap there. **This is the only way a plot is drawn**, and a single plot is
 * one column of it: `../pages/PlotPage.tsx` hands it the list named by
 * `:plotIds`, so comparing plots is this same picture with another column rather
 * than a second screen an author has to learn.
 *
 * The alignment is CSS, not arithmetic: every row's cells are siblings in one
 * grid, so the grid row grows to its tallest card and the others stretch beside
 * it. That is also why each column cannot be its own `DndContext` — a column's
 * cells are interleaved with every other column's in DOM order, so there is one
 * context for the whole grid and `sameColumnOnly` keeps a beat inside its plot.
 *
 * **Row actions live here, not in the page.** Inserting and deleting a row are
 * the same act in both views and the buttons are already in this component, so
 * duplicating them across two pages only bought two chances to disagree.
 * Renaming is the exception: it is route-driven, so the page still owns it.
 */
export function PlotGrid({
  tomeId,
  rows,
  plots,
  items,
  types,
  elements,
  renderColumnHeader,
  onOpenItem,
  onOpenElement,
  onWrite,
  onAddBeat,
  onRenameRow,
}: {
  tomeId: string;
  /** The tome's spine, in order. */
  rows: PlotRow[];
  /** The plots to draw, left to right. */
  plots: Plot[];
  /** Every beat across those plots; the grid indexes them by cell itself. */
  items: PlotItem[];
  types: ElementType[];
  elements: Element[];
  /**
   * What sits atop a column. Omitted by the single-plot view, whose plot tabs
   * already name the one column and sit directly above this grid — a header
   * there would be the plot's name for the third time on one screen.
   */
  renderColumnHeader?: (plot: Plot) => ReactNode;
  onOpenItem: (item: PlotItem) => void;
  onOpenElement: (element: Element) => void;
  /** Opens the beat's manuscript. Threaded through to the card like `onOpenElement`. */
  onWrite: (item: PlotItem) => void;
  /** Author a new beat in an empty cell. */
  onAddBeat: (plotId: string, rowId: string) => void;
  onRenameRow: (row: PlotRow) => void;
}) {
  const confirmAction = useConfirm();
  // Which quiet runs the author has opened back up, by the ids of the rows in
  // them. Purely how much is on screen, so it is state rather than a route — the
  // same call `ElementPage` makes about which field is being edited.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const byCell = useMemo(
    () => new Map(items.map((item) => [cellId(item.plotId, item.plotRowId), item])),
    [items],
  );
  const elementsById = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );
  const rank = useMemo(() => new Map(rows.map((row, index) => [row.id, index])), [rows]);

  // Where each plot's track starts and stops. Between those two ranks the line is
  // drawn through every cell, occupied or not — a quiet stretch of a thread is
  // the thread continuing, not the thread ending.
  const spans = useMemo(() => {
    const out = new Map<string, Span>();
    for (const item of items) {
      const at = rank.get(item.plotRowId);
      if (at === undefined) continue;
      const span = out.get(item.plotId);
      if (!span) out.set(item.plotId, { first: at, last: at });
      else out.set(item.plotId, { first: Math.min(span.first, at), last: Math.max(span.last, at) });
    }
    return out;
  }, [items, rank]);

  // Each plot's beats in spine order — what a within-column drag permutes.
  const orderByPlot = useMemo(() => {
    const grouped = new Map<string, PlotItem[]>();
    for (const item of items) grouped.set(item.plotId, [...(grouped.get(item.plotId) ?? []), item]);
    return new Map(
      [...grouped].map(([plotId, list]) => [
        plotId,
        [...list]
          // A beat whose row went missing sinks to the end rather than claiming
          // the top of its plot — the rule `byRank` applies in the store.
          .sort((a, b) => (rank.get(a.plotRowId) ?? Infinity) - (rank.get(b.plotRowId) ?? Infinity))
          .map((item) => item.id),
      ]),
    );
  }, [items, rank]);

  // Rows nobody on screen stands on, gathered into runs. A long run collapses to
  // one line so that a single plot against a deep spine is still a page you can
  // read; anything shorter is left alone, because a gap of one or two is the
  // shape of the story and is also somewhere you might want to drop a beat.
  const entries = useMemo(() => {
    const held = new Set(items.map((item) => item.plotRowId));
    const out: GridEntry[] = [];
    let run: PlotRow[] = [];
    let runAt = 0;
    const flush = () => {
      if (!run.length) return;
      if (run.length >= QUIET_RUN_MIN) out.push({ kind: "quiet", rows: run, index: runAt });
      else run.forEach((row, offset) => out.push({ kind: "row", row, index: runAt + offset }));
      run = [];
    };
    rows.forEach((row, index) => {
      if (!held.has(row.id) && !expanded.has(row.id)) {
        if (!run.length) runAt = index;
        run.push(row);
        return;
      }
      flush();
      out.push({ kind: "row", row, index });
    });
    flush();
    return out;
  }, [rows, items, expanded]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: cellKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const from = active.data.current as CellData | undefined;
    const to = over?.data.current as CellData | undefined;
    if (!from || !to || from.plotId !== to.plotId || from.rowId === to.rowId) return;
    const displaced = byCell.get(cellId(to.plotId, to.rowId));
    // Two gestures wear one drag, and what is already in the target cell decides
    // which. Landing on a gap *moves* the beat there, opening a gap behind it.
    // Landing on another beat is the ordinary drag-to-reorder every list has, and
    // it shifts the beats in between rather than swapping two of them across the
    // whole thread — `movePlotItemToRow`'s swap is right for filling a cell and
    // wrong for "put this one later".
    if (!displaced) {
      store.movePlotItemToRow(String(active.id), to.rowId);
      return;
    }
    const order = orderByPlot.get(from.plotId) ?? [];
    const at = order.indexOf(String(active.id));
    const onto = order.indexOf(displaced.id);
    if (at < 0 || onto < 0) return;
    store.reorderPlotItems(from.plotId, arrayMove(order, at, onto));
  };

  const handleDeleteRow = async (row: PlotRow, index: number) => {
    const name = plotRowName(row, index);
    const { beats, plots: affected } = await store.countPlotRowBeats(row.id);
    confirmAction(
      // A row reaches across every plot in the tome, not just the ones drawn
      // here, so the cost is stated before it is paid.
      beats
        ? `Delete ${name}? This also deletes ${plural(beats, "beat")} across ${plural(affected, "plot")}.`
        : `Delete ${name}?`,
      () => store.deletePlotRow({ id: row.id, tomeId }),
    );
  };

  const columns = (min: number) => `repeat(${plots.length}, minmax(${min}px, 1fr))`;

  // Two ways to have nothing to draw, and both need saying rather than showing.
  // A tome with no spine yet has no cells, no gutters and no drop targets at all
  // — the only affordance left is the hover-to-insert strip, invisible until you
  // find it. And a plot standing on none of an existing spine's rows collapses
  // every one of them into a single "n quiet rows" line, which is a correct
  // summary of nothing and a terrible first screen for a plot just created.
  if (!rows.length || !items.length)
    return (
      <EmptyState
        title="Start your outline"
        body="Add the first beat, chapter, or turning point in this plot."
      />
    );

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
            gridTemplateColumns: {
              xs: `${GUTTER_WIDTH_XS}px ${columns(MIN_COLUMN_WIDTH_XS)}`,
              sm: `${GUTTER_WIDTH}px ${columns(MIN_COLUMN_WIDTH)}`,
            },
            columnGap: 2,
            alignItems: "stretch",
          }}
        >
          {renderColumnHeader ? (
            <>
              <Box sx={{ position: "sticky", left: 0, zIndex: 3, bgcolor: "background.default" }} />
              {plots.map((plot) => (
                <Box
                  key={plot.id}
                  sx={{ pb: 1.5, borderBottom: 1, borderColor: "divider", minWidth: 0 }}
                >
                  {renderColumnHeader(plot)}
                </Box>
              ))}
            </>
          ) : null}

          {entries.map((entry) =>
            entry.kind === "quiet" ? (
              <Fragment key={entry.rows[0].id}>
                <RowInsert
                  label={`Insert a row above ${plotRowName(entry.rows[0], entry.index)}`}
                  onInsert={() => store.insertPlotRow(tomeId, entry.index)}
                />
                <QuietGutter
                  count={entry.rows.length}
                  onExpand={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      for (const row of entry.rows) next.add(row.id);
                      return next;
                    })
                  }
                />
                {plots.map((plot) => {
                  const span = spans.get(plot.id);
                  const through = Boolean(
                    span &&
                      entry.index > span.first &&
                      entry.index + entry.rows.length - 1 < span.last,
                  );
                  return (
                    <Box key={plot.id} sx={{ minWidth: 0, display: "flex", minHeight: 30 }}>
                      <Track above={through} below={through} />
                    </Box>
                  );
                })}
              </Fragment>
            ) : (
              <Fragment key={entry.row.id}>
                <RowInsert
                  label={`Insert a row above ${plotRowName(entry.row, entry.index)}`}
                  onInsert={() => store.insertPlotRow(tomeId, entry.index)}
                />
                <RowGutter
                  row={entry.row}
                  index={entry.index}
                  onRename={() => onRenameRow(entry.row)}
                  onDelete={() => handleDeleteRow(entry.row, entry.index)}
                />
                {plots.map((plot) => {
                  const item = byCell.get(cellId(plot.id, entry.row.id));
                  const span = spans.get(plot.id);
                  const above = Boolean(span && entry.index > span.first);
                  const below = Boolean(span && entry.index < span.last);
                  return item ? (
                    <BeatCell
                      key={plot.id}
                      item={item}
                      types={types}
                      above={above}
                      below={below}
                      attachments={item.attachedElementIds
                        .map((id) => elementsById.get(id))
                        .filter((element): element is Element => Boolean(element))}
                      onOpen={() => onOpenItem(item)}
                      onOpenElement={onOpenElement}
                      onWrite={onWrite}
                    />
                  ) : (
                    <EmptyCell
                      key={plot.id}
                      plot={plot}
                      row={entry.row}
                      rowLabel={plotRowName(entry.row, entry.index)}
                      above={above}
                      below={below}
                      onAdd={() => onAddBeat(plot.id, entry.row.id)}
                    />
                  );
                })}
              </Fragment>
            ),
          )}
          <RowInsert
            label="Add a row at the end"
            onInsert={() => store.insertPlotRow(tomeId, rows.length)}
          />
        </Box>
      </Box>
    </DndContext>
  );
}

/**
 * The line a column's beats are strung along, and the dot for the one in this
 * cell. This is what MUI's `TimelineSeparator` drew before the two plot views
 * were merged, rebuilt as part of a grid cell because `Timeline` cannot span
 * columns — and it is the reason a single plot still looks like a timeline.
 *
 * Each segment overshoots its cell by the height of the insert strip between two
 * rows, which is what makes a track drawn cell by cell read as one unbroken line.
 */
function Track({
  above,
  below,
  children,
}: {
  /** Continue the line up out of this cell — false at the plot's first beat. */
  above: boolean;
  /** Continue it down — false at the last. */
  below: boolean;
  children?: ReactNode;
}) {
  const segment = {
    position: "absolute",
    left: "50%",
    width: "2px",
    ml: "-1px",
    bgcolor: "divider",
  } as const;
  return (
    <Box
      sx={{
        width: TRACK_WIDTH,
        flexShrink: 0,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {above ? <Box sx={{ ...segment, top: -INSERT_STRIP, bottom: "50%" }} /> : null}
      {below ? <Box sx={{ ...segment, top: "50%", bottom: -INSERT_STRIP }} /> : null}
      {children ? <Box sx={{ position: "relative", zIndex: 1 }}>{children}</Box> : null}
    </Box>
  );
}

/** One spine row's name and its two actions, in the sticky left column. */
function RowGutter({
  row,
  index,
  onRename,
  onDelete,
}: {
  row: PlotRow;
  index: number;
  onRename: () => void;
  onDelete: () => void;
}) {
  const name = plotRowName(row, index);
  return (
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
        {name}
      </Typography>
      <Stack direction="row" sx={{ mt: 0.25, ml: -0.5 }}>
        <Tooltip title="Rename row">
          <IconButton
            size="small"
            className="row-action"
            aria-label={`Rename ${name}`}
            onClick={onRename}
            sx={{ opacity: 0, transition: "opacity 120ms ease" }}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete row">
          <IconButton
            size="small"
            className="row-action"
            aria-label={`Delete ${name}`}
            onClick={onDelete}
            sx={{ opacity: 0, transition: "opacity 120ms ease" }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

/** A collapsed run of rows nothing on screen stands on. Click to put them back. */
function QuietGutter({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <Box
      sx={{
        position: "sticky",
        left: 0,
        zIndex: 2,
        bgcolor: "background.default",
        pr: 1,
        display: "flex",
        alignItems: "center",
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={onExpand}
        aria-label={`Show ${plural(count, "quiet row")}`}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          p: 0,
          border: 0,
          bgcolor: "transparent",
          color: "text.disabled",
          cursor: "pointer",
          textAlign: "left",
          "&:hover, &:focus-visible": { color: "primary.main" },
        }}
      >
        <UnfoldMoreIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption" sx={{ lineHeight: 1.3 }}>
          {plural(count, "quiet row")}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * The full-width strip between two rows, which reveals a "+" on hover or focus.
 * It spans every column because a row belongs to the whole tome, not to one plot.
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
        height: `${INSERT_STRIP}px`,
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
  above,
  below,
  onOpen,
  onOpenElement,
  onWrite,
}: {
  item: PlotItem;
  attachments: Element[];
  types: ElementType[];
  above: boolean;
  below: boolean;
  onOpen: () => void;
  onOpenElement: (element: Element) => void;
  /** Opens the beat's manuscript. Threaded through to the card like `onOpenElement`. */
  onWrite: (item: PlotItem) => void;
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
    // No vertical padding on the cell itself: the track has to run its whole
    // height for the line to meet the next cell's. The card carries the spacing.
    <Box ref={setDropRef} sx={{ minWidth: 0, display: "flex", alignItems: "stretch" }}>
      <Track above={above} below={below}>
        <BeatDot item={item} />
      </Track>
      <Box
        ref={setDragRef}
        sx={{
          flex: 1,
          minWidth: 0,
          my: 1.5,
          transform: CSS.Translate.toString(transform),
          zIndex: isDragging ? 1 : undefined,
          opacity: isDragging ? 0.65 : 1,
          // Dropping onto a beat reorders the column, so the cell being dropped
          // onto is worth marking even though it is full.
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
          onWrite={onWrite}
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
  above,
  below,
  onAdd,
}: {
  plot: Plot;
  row: PlotRow;
  rowLabel: string;
  above: boolean;
  below: boolean;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(plot.id, row.id),
    data: { plotId: plot.id, rowId: row.id } satisfies CellData,
  });
  return (
    <Box ref={setNodeRef} sx={{ minWidth: 0, display: "flex", alignItems: "stretch" }}>
      <Track above={above} below={below} />
      <Box
        component="button"
        type="button"
        aria-label={`Add a beat to ${plot.name} at ${rowLabel}`}
        onClick={onAdd}
        sx={{
          flex: 1,
          my: 1.5,
          minHeight: 44,
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
