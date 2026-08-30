import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import LibraryAddIcon from "@mui/icons-material/LibraryAdd";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import type { Element } from "../models/Element";
import type { Plot, PlotItem, PlotRow } from "../models/Plot";
import { store } from "../services/store";
import { useConfirm } from "../context/ConfirmContext";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { PlotGrid } from "../components/PlotGrid";
import { PlotItemDialog } from "../components/PlotItemDialog";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Any number of a tome's plots drawn against its shared row axis — a subplot
 * against the main line, three POV threads, a draft against its rewrite. Beats
 * sharing a row line up, and a plot with nothing on a row shows a gap there.
 *
 * The columns live in the URL as a comma-joined list (`…/plots/compare/a,b,c`),
 * so a comparison is a link like everything else in this app. The list is
 * canonical: unknown and repeated ids are dropped and the URL rewritten, and
 * anything left with fewer than two plots falls back to the single-plot view,
 * since one plot compared with itself is not a comparison.
 */
export function PlotComparePage({ creating = false }: { creating?: boolean }) {
  const { plotIds, itemId, sidePlotId, rowId } = useParams<{
    plotIds: string;
    itemId?: string;
    sidePlotId?: string;
    rowId?: string;
  }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [addMenu, setAddMenu] = useState<HTMLElement | null>(null);

  const plots = useObservable<Plot[]>((cb) => store.observePlots(tome!.id, cb), [tome?.id]);
  const rows =
    useObservable<PlotRow[]>((cb) => store.observePlotRows(tome!.id, cb), [tome?.id]) ?? [];
  // Every beat in the tome in one query, rather than one subscription per column:
  // the number of columns is a route parameter, and hooks cannot be counted by it.
  const allItems =
    useObservable<PlotItem[]>((cb) => store.observeTomePlotItems(tome!.id, cb), [tome?.id]) ?? [];
  const elements =
    useObservable<Element[]>((cb) => store.observeTomeElements(tome!.id, cb), [tome?.id]) ?? [];

  const requested = useMemo(() => (plotIds ?? "").split(",").filter(Boolean), [plotIds]);
  const columns = useMemo(() => {
    if (!plots) return [];
    const resolved: Plot[] = [];
    for (const id of requested) {
      const plot = plots.find((candidate) => candidate.id === id);
      if (plot && !resolved.some((seen) => seen.id === plot.id)) resolved.push(plot);
    }
    return resolved;
  }, [plots, requested]);

  const canonical = columns.map((plot) => plot.id).join(",");
  const comparePath = tome ? `/tomes/${tome.id}/plots/compare/${canonical}` : "";

  useEffect(() => {
    if (!tome || !plots) return;
    if (columns.length < 2) {
      const fallback = columns[0] ?? plots[0];
      navigate(fallback ? `/tomes/${tome.id}/plots/${fallback.id}` : `/tomes/${tome.id}/plots`, {
        replace: true,
      });
      return;
    }
    // A hand-edited URL naming a deleted or repeated plot is rewritten to what is
    // actually on screen, so a refresh or a shared link resolves the same way.
    if (canonical !== plotIds) navigate(comparePath, { replace: true });
  }, [tome, plots, columns, canonical, plotIds, comparePath, navigate]);

  if (!tome || !plots) return null;
  if (columns.length < 2) return null;

  const items = allItems.filter((item) => columns.some((plot) => plot.id === item.plotId));
  const held = new Set(allItems.map((item) => item.plotRowId));
  const emptyRows = rows.filter((row) => !held.has(row.id)).length;
  const unused = plots.filter((plot) => !columns.some((column) => column.id === plot.id));

  const closeDialog = () => navigate(comparePath);
  const withColumns = (ids: string[]) => `/tomes/${tome.id}/plots/compare/${ids.join(",")}`;
  const editingItem = itemId ? allItems.find((item) => item.id === itemId) : undefined;
  const insertPlot = creating ? columns.find((plot) => plot.id === sidePlotId) : undefined;
  // `:rowId` serves both the rename route and the insert route; `creating` says which.
  const renamingRow = !creating && rowId ? rows.find((row) => row.id === rowId) : undefined;
  const rowName = (row: PlotRow) =>
    row.label || `Row ${rows.findIndex((candidate) => candidate.id === row.id) + 1}`;

  const handleDeleteRow = async (row: PlotRow) => {
    const { beats, plots: affected } = await store.countPlotRowBeats(row.id);
    confirmAction(
      beats
        ? `Delete ${rowName(row)}? This also deletes ${plural(beats, "beat")} across ${plural(affected, "plot")}.`
        : `Delete ${rowName(row)}?`,
      () => store.deletePlotRow({ id: row.id, tomeId: tome.id }),
    );
  };

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renamingRow) return;
    const label = String(new FormData(event.currentTarget).get("label") ?? "");
    store.setPlotRowLabel(renamingRow.id, label);
    closeDialog();
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
            Compare timelines
          </Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Tooltip title={unused.length ? "Add another plot line" : "Every plot is already shown"}>
            {/* A disabled button fires no events, so the tooltip needs a live wrapper. */}
            <span>
              <Button
                size="small"
                startIcon={<LibraryAddIcon />}
                disabled={!unused.length}
                onClick={(event) => setAddMenu(event.currentTarget)}
              >
                Add plot
              </Button>
            </span>
          </Tooltip>
          <Menu anchorEl={addMenu} open={Boolean(addMenu)} onClose={() => setAddMenu(null)}>
            {unused.map((plot) => (
              <MenuItem
                key={plot.id}
                onClick={() => {
                  setAddMenu(null);
                  navigate(withColumns([...columns.map((column) => column.id), plot.id]));
                }}
              >
                {plot.name}
              </MenuItem>
            ))}
          </Menu>
          <Tooltip
            title={
              emptyRows
                ? `Drop ${plural(emptyRows, "row")} no plot has a beat on`
                : "No empty rows to remove"
            }
          >
            <span>
              <Button
                size="small"
                startIcon={<UnfoldLessIcon />}
                disabled={!emptyRows}
                onClick={() => store.removeEmptyPlotRows(tome.id)}
              >
                Remove empty rows
              </Button>
            </span>
          </Tooltip>
          <Button
            size="small"
            startIcon={<CloseIcon />}
            onClick={() => navigate(`/tomes/${tome.id}/plots/${columns[0].id}`)}
          >
            Exit compare
          </Button>
        </Stack>
      </Stack>

      <PlotGrid
        rows={rows}
        plots={columns}
        items={items}
        types={types}
        elements={elements}
        renderColumnHeader={(plot) => (
          <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
            <TextField
              select
              size="small"
              label="Plot"
              value={plot.id}
              onChange={(event) =>
                navigate(
                  withColumns(
                    columns.map((column) =>
                      column.id === plot.id ? event.target.value : column.id,
                    ),
                  ),
                )
              }
              sx={{ flex: 1, minWidth: 0 }}
            >
              {plots.map((option) => (
                <MenuItem
                  key={option.id}
                  value={option.id}
                  // Another column already has it; a plot cannot face itself.
                  disabled={
                    option.id !== plot.id && columns.some((column) => column.id === option.id)
                  }
                >
                  {option.name}
                </MenuItem>
              ))}
            </TextField>
            <Tooltip title={`Add a beat to ${plot.name}`}>
              <IconButton
                size="small"
                aria-label={`Add a beat to ${plot.name}`}
                onClick={() => navigate(`${comparePath}/insert/${plot.id}`)}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {columns.length > 2 ? (
              <Tooltip title={`Stop comparing ${plot.name}`}>
                <IconButton
                  size="small"
                  aria-label={`Remove ${plot.name} from the comparison`}
                  onClick={() =>
                    navigate(
                      withColumns(
                        columns.filter((column) => column.id !== plot.id).map((c) => c.id),
                      ),
                    )
                  }
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        )}
        onOpenItem={(item) => navigate(`${comparePath}/items/${item.id}`)}
        onOpenElement={(element) =>
          navigate(`/tomes/${tome.id}/elements/${element.elementTypeId}/${element.id}/edit`)
        }
        // The manuscript has one address regardless of which view found the beat,
        // so compare links at the beat's own plot rather than at a compare-scoped
        // variant of the route.
        onWrite={(item) => navigate(`/tomes/${tome.id}/plots/${item.plotId}/items/${item.id}/write`)}
        onAddBeat={(plotId, targetRow) =>
          navigate(`${comparePath}/insert/${plotId}/${targetRow}`)
        }
        onInsertRow={(index) => store.insertPlotRow(tome.id, index)}
        onRenameRow={(row) => navigate(`${comparePath}/rows/${row.id}`)}
        onDeleteRow={handleDeleteRow}
      />

      <PlotItemDialog
        open={Boolean(editingItem) || Boolean(insertPlot)}
        item={editingItem}
        // Only a create carries a row from the route; an edit keeps the one it has.
        plotRowId={creating ? rowId : undefined}
        tomeId={tome.id}
        // An existing beat carries the plot it belongs to; a new one takes it from
        // the route, because with several grids on screen a position alone does
        // not say which plot is being added to.
        plotId={editingItem?.plotId ?? insertPlot?.id ?? columns[0].id}
        elements={elements}
        types={types}
        onOpenManuscript={(item) =>
          navigate(`/tomes/${tome.id}/plots/${item.plotId}/items/${item.id}/write`)
        }
        onClose={closeDialog}
      />

      <Dialog open={Boolean(renamingRow)} onClose={closeDialog} maxWidth="xs" fullWidth>
        {/*
          Keyed on the row so the uncontrolled field re-seeds: MUI keeps a dialog's
          children mounted until the close transition ends, and without this,
          renaming one row and then another reopens carrying the first one's label.
        */}
        <Box component="form" onSubmit={handleRename} key={renamingRow?.id}>
          <DialogTitle>Name this row</DialogTitle>
          <DialogContent dividers>
            <TextField
              name="label"
              label="Row label"
              fullWidth
              autoFocus
              defaultValue={renamingRow?.label ?? ""}
              helperText="Shown in the gutter beside every plot, e.g. Act I or Day 12"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button type="submit" variant="contained">
              Save
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
