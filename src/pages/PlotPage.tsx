import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import IosShareIcon from "@mui/icons-material/IosShare";
import type { Element } from "../models/Element";
import type { Plot, PlotItem, PlotRow } from "../models/Plot";
import type { SaveState } from "../hooks/autosave";
import type { WriteItem } from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { PlotGrid } from "../components/PlotGrid";
import { PlotItemDialog } from "../components/PlotItemDialog";
import { PlotPicker } from "../components/PlotPicker";
import { RemoveEmptyRowsButton } from "../components/RemoveEmptyRowsButton";
import { SaveStatus } from "../components/SaveStatus";
import { ManuscriptExportDialog } from "../components/ManuscriptExportDialog";

/**
 * The plotting screen: **one or more** of a tome's plots drawn against its
 * shared row axis. Beats sharing a row line up, and a plot with nothing on a row
 * shows a gap there.
 *
 * There used to be a second page for the several-plots case, reached through a
 * "Compare" button and left through "Exit compare". It is gone, and so is the
 * mode: `:plotIds` is a comma-joined list of one or more, the tabs in
 * `PlotPicker` toggle which plots are in it, and one plot is simply a list of
 * length one. `plots/compare/:plotIds` still resolves — `PlotCompareRedirect`
 * rewrites the old addresses — because a comparison was always a link people
 * could have kept.
 *
 * The list is canonical: unknown and repeated ids are dropped and the URL
 * rewritten, so a refresh or a shared link resolves the same way. Two orders
 * come out of it and they are not the same one:
 *
 * - **`selected`** is the URL's own order, and its first id is the **primary**
 *   plot — the tab the strip marks selected, and what rename, delete, "Add item"
 *   and the manuscript export act on. Toggling a plot on appends to this, so the
 *   primary stays where it is and those actions never quietly change target.
 * - **`columns`** is the same plots in the tabs' order, and is what gets drawn.
 *   Reordering the tabs reorders the columns; there is deliberately no second
 *   gesture for it.
 */
export function PlotPage({
  creating = false,
  exporting = false,
}: {
  creating?: boolean;
  exporting?: boolean;
}) {
  const { plotIds, itemId, sidePlotId, rowId } = useParams<{
    plotIds?: string;
    itemId?: string;
    sidePlotId?: string;
    rowId?: string;
  }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();
  const [newPlotOpen, setNewPlotOpen] = useState(false);
  // Row labels are edited in the gutter, so their autosave needs somewhere to
  // report. It stays null until the first edit: this is not an editing surface
  // the way the tome overview is, and a permanent "Saved" beside the plot's
  // actions would be a claim about nothing.
  const [save, setSave] = useState<{ state: SaveState; retry: () => void } | null>(null);
  // Stable, because `InlineTextField` re-fires on identity change and every
  // gutter shares this one — see `PlotGrid`'s `onSaveState`.
  const handleSaveState = useCallback(
    (state: SaveState, retry: () => void) => setSave({ state, retry }),
    [],
  );

  const plots = useObservable<Plot[]>((cb) => store.observePlots(tome!.id, cb), [tome?.id]);
  const rows =
    useObservable<PlotRow[]>((cb) => store.observePlotRows(tome!.id, cb), [tome?.id]) ?? [];
  // Every beat in the tome in one query, rather than one subscription per column:
  // the number of columns is a route parameter, and hooks cannot be counted by it.
  // It is also what "which rows are empty" has to be asked of, since the spine is
  // tome-wide and a row nothing on screen stands on may still be occupied.
  const allItems =
    useObservable<PlotItem[]>((cb) => store.observeTomePlotItems(tome!.id, cb), [tome?.id]) ?? [];
  const elements =
    useObservable<Element[]>((cb) => store.observeTomeElements(tome!.id, cb), [tome?.id]) ?? [];
  // The export needs the texts themselves: a beat holds only their ids, and the
  // rows are tome-level rather than the plot's.
  const writeItems =
    useObservable<WriteItem[]>(
      (cb) => store.observeWriteItems(tome!.id, cb),
      [tome?.id],
    ) ?? [];

  const requested = useMemo(() => (plotIds ?? "").split(",").filter(Boolean), [plotIds]);
  // What the URL names, in the URL's own order: the **primary** plot first, then
  // the rest in the order they were switched on. That order is what the address
  // has to preserve, since it is the only place the primary is recorded.
  const selected = useMemo(() => {
    if (!plots) return [];
    const resolved: Plot[] = [];
    for (const id of requested) {
      const plot = plots.find((candidate) => candidate.id === id);
      if (plot && !resolved.some((seen) => seen.id === plot.id)) resolved.push(plot);
    }
    return resolved;
  }, [plots, requested]);

  // What is drawn, left to right: the same plots in the **tabs'** order, so the
  // columns read in the order the strip above them does. Reordering the tabs
  // reorders the columns, which is the only gesture for it — dragging a column
  // would be a second way to say the same thing, and the tab drag already writes
  // `Plot.sortOrder`, which is what `observePlots` returns them in.
  const columns = useMemo(() => {
    if (!plots) return [];
    const rank = new Map(plots.map((plot, index) => [plot.id, index]));
    return [...selected].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, [plots, selected]);

  const canonical = selected.map((plot) => plot.id).join(",");
  const plotsPath = tome ? `/tomes/${tome.id}/plots/${canonical}` : "";

  useEffect(() => {
    if (!tome || !plots) return;
    if (selected.length) {
      // A hand-edited URL naming a deleted or repeated plot is rewritten to what
      // is actually on screen. `rows/:rowId` goes the same way: it addressed the
      // rename dialog, and a label is edited in the gutter now, so there is
      // nothing for that address to reopen.
      if (canonical !== plotIds || (!creating && rowId)) navigate(plotsPath, { replace: true });
      return;
    }
    if (plots.length) {
      navigate(`/tomes/${tome.id}/plots/${plots[0].id}`, { replace: true });
      return;
    }
    let active = true;
    store.ensureDefaultPlot(tome.id).then((plot) => {
      if (active) navigate(`/tomes/${tome.id}/plots/${plot.id}`, { replace: true });
    });
    return () => {
      active = false;
    };
  }, [tome, plots, selected, canonical, plotIds, plotsPath, creating, rowId, navigate]);

  if (!tome || !plots) return null;
  if (!selected.length) return null;

  // The tab the strip marks selected. It is the URL's first id rather than the
  // leftmost column, so switching another plot on cannot silently retarget the
  // rename, the delete or the export at whichever one happens to sort first.
  const primary = selected[0];
  const items = allItems.filter((item) => columns.some((plot) => plot.id === item.plotId));
  // The manuscript is one plot line, and `buildManuscript` reads its beats in
  // `sortOrder` — which `observeTomePlotItems` does not return them in.
  const primaryItems = allItems
    .filter((item) => item.plotId === primary.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const closeDialog = () => navigate(plotsPath);
  const withColumns = (ids: string[]) => `/tomes/${tome.id}/plots/${ids.join(",")}`;
  const editingItem = itemId ? allItems.find((item) => item.id === itemId) : undefined;
  const insertPlot = creating ? columns.find((plot) => plot.id === sidePlotId) : undefined;

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
            {columns.map((plot) => plot.name).join(" · ")}
          </Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          {save ? <SaveStatus state={save.state} onRetry={save.retry} /> : null}
          <RemoveEmptyRowsButton tomeId={tome.id} rows={rows} tomeItems={allItems} />
          {/*
            A manuscript is one plot line, so with several columns this has to
            name one of them: the primary, which is the tab the author selected.
            Reaching another one's manuscript is a tab click away.
          */}
          <Tooltip
            title={
              !primaryItems.length
                ? "Add a beat before exporting a manuscript"
                : `Turn ${primary.name} into a Word or PDF manuscript`
            }
          >
            {/* A disabled button fires no events, so the tooltip needs a live wrapper. */}
            <span>
              <Button
                startIcon={<IosShareIcon />}
                disabled={!primaryItems.length}
                onClick={() => navigate(`${plotsPath}/export`)}
              >
                Export
              </Button>
            </span>
          </Tooltip>
          <Button startIcon={<AddIcon />} onClick={() => setNewPlotOpen(true)}>
            New plot
          </Button>
        </Stack>
      </Stack>

      <PlotPicker
        tome={tome}
        plots={plots}
        columns={columns}
        primary={primary}
        newPlotOpen={newPlotOpen}
        onCloseNewPlot={() => setNewPlotOpen(false)}
        onAddItem={() => navigate(`${plotsPath}/insert/${primary.id}`)}
        onShowOnly={(plot) => navigate(withColumns([plot.id]))}
        onToggleColumn={(plot) =>
          navigate(
            selected.some((column) => column.id === plot.id)
              ? withColumns(selected.filter((column) => column.id !== plot.id).map((c) => c.id))
              : withColumns([...selected.map((column) => column.id), plot.id]),
          )
        }
      />

      <PlotGrid
        tomeId={tome.id}
        rows={rows}
        plots={columns}
        items={items}
        types={types}
        elements={elements}
        // One column needs no header: the tab strip sits directly above it and
        // already names it. Several do, and the header is only a name and a way
        // to add a beat — which plots are drawn is the tab strip's business.
        renderColumnHeader={
          columns.length > 1
            ? (plot) => (
                <Stack direction="row" sx={{ alignItems: "center", gap: 0.5 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {plot.name}
                  </Typography>
                  <Tooltip title={`Add a beat to ${plot.name}`}>
                    <IconButton
                      size="small"
                      aria-label={`Add a beat to ${plot.name}`}
                      onClick={() => navigate(`${plotsPath}/insert/${plot.id}`)}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              )
            : undefined
        }
        onOpenItem={(item) => navigate(`${plotsPath}/items/${item.id}`)}
        onOpenElement={(element) =>
          navigate(`/tomes/${tome.id}/elements/${element.elementTypeId}/${element.id}`)
        }
        // A beat's manuscript has one address regardless of how many columns
        // found it, so this links at the beat's own plot alone.
        onWrite={(item) => navigate(`/tomes/${tome.id}/plots/${item.plotId}/items/${item.id}/write`)}
        onAddBeat={(plotId, targetRow) => navigate(`${plotsPath}/insert/${plotId}/${targetRow}`)}
        onSaveState={handleSaveState}
      />

      <PlotItemDialog
        open={Boolean(editingItem) || Boolean(insertPlot)}
        item={editingItem}
        // Only a create carries a row from the route; an edit keeps the one it has.
        plotRowId={creating ? rowId : undefined}
        tomeId={tome.id}
        // An existing beat carries the plot it belongs to; a new one takes it from
        // the route, because with several columns on screen a position alone does
        // not say which plot is being added to.
        plotId={editingItem?.plotId ?? insertPlot?.id ?? primary.id}
        elements={elements}
        types={types}
        onOpenManuscript={(item) =>
          navigate(`/tomes/${tome.id}/plots/${item.plotId}/items/${item.id}/write`)
        }
        onClose={closeDialog}
      />

      {exporting && (
        <ManuscriptExportDialog
          tome={tome}
          plot={primary}
          beats={primaryItems}
          writeItems={writeItems}
          onClose={closeDialog}
        />
      )}
    </Box>
  );
}
