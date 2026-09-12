import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  type TabProps,
} from "@mui/material";
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
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import type { Plot } from "../models/Plot";
import type { Tome } from "../models/Tome";
import { store } from "../services/store";
import { useConfirm } from "../context/ConfirmContext";
import { defaultPlotTemplateId, plotTemplateById } from "../models/PlotTemplate";
import { PlotTemplatePicker } from "./PlotTemplatePicker";

/**
 * A button nested inside a tab — the drag handle and the column toggle are both
 * this shape, and both need the same two workarounds.
 *
 * A plain `button`, not MUI's `IconButton`: `ButtonBase` routes key events
 * through its own wrapper and consumes the Space that dnd-kit's `KeyboardSensor`
 * needs to start a lift. And a native `title` rather than MUI's `Tooltip`:
 * `Tooltip` clones its child, which costs the drag handle its activator ref, and
 * the `KeyboardSensor` refuses to lift unless the key event's target is exactly
 * the node passed to `setActivatorNodeRef`.
 */
const tabButtonSx = {
  p: 0.25,
  display: "inline-flex",
  border: 0,
  borderRadius: "50%",
  bgcolor: "transparent",
  color: "inherit",
  cursor: "pointer",
  "&:hover": { bgcolor: "action.hover" },
} as const;

/**
 * One draggable plot tab, carrying its own column toggle.
 *
 * Two constraints from `Tabs` shape this component. It clones its children to
 * inject selection state (`selected`, `indicator`, `onChange`, …), so every prop
 * it hands down has to reach the inner `Tab` — hence the blanket spread. And it
 * measures the selection indicator off `tabList.children[index]`, so this must
 * render exactly one DOM node: the `Tab` itself, never a wrapper element.
 *
 * The tab root is a `div` rather than the default `button` so that it can
 * legally contain those nested buttons. That nesting is also what makes the tab
 * keyboard-draggable: `ButtonBase` ignores key events whose target is not the
 * tab itself, so Space and Enter on the handle start a lift instead of selecting
 * the tab, and dnd-kit's `preventDefault` on the arrow keys stops the tablist's
 * roving-tabindex handler from stealing them mid-drag.
 */
function SortablePlotTab({
  name,
  showHandle,
  shown,
  primary,
  canRemove,
  columnLabel,
  onToggleColumn,
  ...tabProps
}: TabProps & {
  name: string;
  showHandle: boolean;
  /** This plot is currently drawn as a column. */
  shown: boolean;
  /**
   * This is the tab the tablist calls selected. Passed rather than read off the
   * `selected` prop `Tabs` injects when it clones us: that prop is MUI's own
   * business and is not in `TabProps`.
   */
  primary: boolean;
  /** Removing it would leave at least one column standing. */
  canRemove: boolean;
  columnLabel: string;
  onToggleColumn: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(tabProps.value) });

  return (
    <Tab
      {...tabProps}
      component="div"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // Lift the dragged tab over its neighbours as they slide past.
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.75 : undefined,
      }}
      // A tab can be drawn as a column without being the one the tablist calls
      // selected — several columns, one `value`. Colouring the others primary is
      // what says "this is on screen", and the toggle below carries the state
      // for anyone not looking at colour.
      sx={shown && !primary ? { color: "primary.main" } : undefined}
      label={
        <Stack direction="row" sx={{ alignItems: "center", gap: 0.25 }}>
          {showHandle ? (
            <Box
              component="button"
              type="button"
              ref={setActivatorNodeRef}
              title="Drag to reorder"
              aria-label={`Reorder ${name}`}
              {...attributes}
              {...listeners}
              onClick={(event: MouseEvent) => event.stopPropagation()}
              sx={{
                ...tabButtonSx,
                ml: -0.75,
                color: "text.secondary",
                cursor: "grab",
                touchAction: "none",
                "&:active": { cursor: "grabbing" },
              }}
            >
              <DragIndicatorIcon sx={{ fontSize: 18 }} />
            </Box>
          ) : null}
          {name}
          {/*
            The whole of "compare" is this button. There is no compare mode and no
            compare page any more: a plot is either drawn as a column or it is
            not, and this toggles that. Hidden only when it would offer to remove
            the last column, since something has to be on screen.
          */}
          {shown && !canRemove ? null : (
            <Box
              component="button"
              type="button"
              title={columnLabel}
              aria-label={columnLabel}
              aria-pressed={shown}
              onClick={(event: MouseEvent) => {
                event.stopPropagation();
                onToggleColumn();
              }}
              sx={{
                ...tabButtonSx,
                mr: -0.75,
                color: shown ? "inherit" : "text.secondary",
              }}
            >
              {shown ? (
                <CloseIcon sx={{ fontSize: 16 }} />
              ) : (
                <CompareArrowsIcon sx={{ fontSize: 16 }} />
              )}
            </Box>
          )}
        </Stack>
      }
    />
  );
}

/**
 * The tome's plots as tabs, and **the only control over which of them are drawn**.
 * Clicking a tab shows that plot alone; the toggle inside each tab adds or
 * removes it as a further column. That is why there is no longer a compare
 * button, a compare page, or an "exit compare" to get back out of — the set of
 * columns is just the set of tabs switched on, and it lives in the URL.
 *
 * It also handles create, rename and delete, all of which act on the **primary**
 * plot: the URL's first id (`selected[0]` in `PlotPage`), passed in as
 * `primary` — the one the tablist marks selected. Not `columns[0]`, which is
 * whichever drawn plot sorts first.
 */
export function PlotPicker({
  tome,
  plots,
  columns,
  primary,
  newPlotOpen,
  onCloseNewPlot,
  onAddItem,
  onShowOnly,
  onToggleColumn,
}: {
  tome: Tome;
  plots: Plot[];
  /** The plots currently drawn. Only the set matters here, not the order. */
  columns: Plot[];
  /** The one the tablist marks selected, and what rename and delete act on. */
  primary: Plot;
  newPlotOpen: boolean;
  onCloseNewPlot: () => void;
  onAddItem: () => void;
  /** Draw this plot and nothing else. */
  onShowOnly: (plot: Plot) => void;
  /** Add this plot as a further column, or drop it from the ones drawn. */
  onToggleColumn: (plot: Plot) => void;
}) {
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState("");
  const [plotTemplateId, setPlotTemplateId] = useState(defaultPlotTemplateId);
  const plotTemplate = plotTemplateById(plotTemplateId);

  // Rename and delete act on the plot the tablist calls selected. It is passed
  // in rather than taken as `columns[0]`: the columns are drawn in tab order, so
  // the leftmost is not necessarily the one the author picked.
  const current = primary;
  const shown = useMemo(() => new Set(columns.map((plot) => plot.id)), [columns]);

  // "New plot" is triggered from the page header, so the parent owns that flag.
  const editing = renaming ? "rename" : newPlotOpen ? "new" : null;

  /*
   * The dialog's fields are uncontrolled, and MUI keeps the dialog's children
   * mounted until its close transition finishes — so a rename cancelled and
   * followed straight by "New plot" would otherwise reopen carrying the old
   * plot's name. Resetting on open restores whatever `defaultValue` the
   * current mode asks for.
   */
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (editing) formRef.current?.reset();
  }, [editing]);

  const closeDialog = () => {
    setError("");
    setRenaming(false);
    setPlotTemplateId(defaultPlotTemplateId);
    onCloseNewPlot();
  };

  // The live query is the source of truth, but a drag needs an immediate answer,
  // so the rendered order is held locally and re-seeded when the stored set changes.
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const storedKey = plots.map((plot) => plot.id).join("|");
  useEffect(() => {
    setOrderedIds((currentIds) => {
      const stored = storedKey ? storedKey.split("|") : [];
      const sameSet =
        currentIds.length === stored.length && currentIds.every((id) => stored.includes(id));
      // An echo of an order this component already applied must not stomp it.
      return sameSet ? currentIds : stored;
    });
  }, [storedKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = useMemo(() => new Map(plots.map((plot) => [plot.id, plot])), [plots]);
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter((plot): plot is Plot => Boolean(plot));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedIds.indexOf(String(active.id));
    const to = orderedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(orderedIds, from, to);
    setOrderedIds(next);
    store.reorderPlots(tome.id, next);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "");
    const description = String(data.get("description") ?? "");
    try {
      if (editing === "rename") {
        await store.savePlot({ id: current.id, tomeId: tome.id, name, description });
        closeDialog();
        return;
      }
      // A blank name falls through to the structure's own — see
      // `createPlotFromTemplate`, which also covers "No plot line" by writing a
      // plot with no beats.
      const plot = await store.createPlotFromTemplate(tome.id, plotTemplateId, {
        name,
        description,
      });
      closeDialog();
      navigate(`/tomes/${tome.id}/plots/${plot.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this plot.");
    }
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedIds} strategy={horizontalListSortingStrategy}>
            <Tabs
              value={current.id}
              onChange={(_, value: string) => {
                const plot = byId.get(value);
                if (plot) onShowOnly(plot);
              }}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ flex: 1, minHeight: 44, "& .MuiTab-root": { minHeight: 44 } }}
            >
              {ordered.map((plot) => (
                <SortablePlotTab
                  key={plot.id}
                  value={plot.id}
                  name={plot.name}
                  showHandle={ordered.length > 1}
                  shown={shown.has(plot.id)}
                  primary={plot.id === current.id}
                  canRemove={columns.length > 1}
                  columnLabel={
                    shown.has(plot.id)
                      ? `Stop showing ${plot.name}`
                      : `Show ${plot.name} beside ${current.name}`
                  }
                  onToggleColumn={() => onToggleColumn(plot)}
                />
              ))}
            </Tabs>
          </SortableContext>
        </DndContext>
        <Tooltip title={`Rename ${current.name}`}>
          <IconButton
            size="small"
            aria-label={`Rename ${current.name}`}
            onClick={() => {
              setError("");
              setRenaming(true);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={`Delete ${current.name}`}>
          <IconButton
            size="small"
            aria-label={`Delete ${current.name}`}
            onClick={() =>
              confirmAction(
                `Permanently delete "${current.name}" and all of its items? This cannot be undone.`,
                async () => {
                  await store.deletePlot(current);
                  navigate(`/tomes/${tome.id}/plots`, { replace: true });
                },
              )
            }
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button size="small" startIcon={<AddIcon />} onClick={onAddItem}>
          Add item
        </Button>
      </Stack>

      <Dialog open={editing !== null} onClose={closeDialog} maxWidth="xs" fullWidth>
        <Box component="form" ref={formRef} onSubmit={handleSubmit}>
          <DialogTitle>{editing === "rename" ? "Rename plot" : "New plot"}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              {editing === "new" ? (
                <PlotTemplatePicker value={plotTemplateId} onChange={setPlotTemplateId} />
              ) : null}
              {/*
                Left blank, a new plot takes the structure's name — so the field
                is optional exactly when there is a structure to name it after,
                and the placeholder is forced visible so that name is readable
                without focusing the field.
              */}
              <TextField
                name="name"
                label="Name"
                required={editing === "rename" || !plotTemplate}
                fullWidth
                autoFocus
                defaultValue={editing === "rename" ? current.name : ""}
                placeholder={editing === "new" ? plotTemplate?.name : undefined}
                helperText={
                  editing === "new" && plotTemplate ? `Leave blank to use "${plotTemplate.name}".` : undefined
                }
                slotProps={editing === "new" ? { inputLabel: { shrink: true } } : undefined}
              />
              <TextField
                name="description"
                label="Description"
                fullWidth
                multiline
                minRows={2}
                defaultValue={editing === "rename" ? (current.description ?? "") : ""}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button type="submit" variant="contained">
              Save plot
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
