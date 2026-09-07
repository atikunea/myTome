import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import IosShareIcon from "@mui/icons-material/IosShare";
import type { Element } from "../models/Element";
import type { Plot, PlotItem, PlotRow } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { PlotGrid } from "../components/PlotGrid";
import { PlotItemDialog } from "../components/PlotItemDialog";
import { PlotPicker } from "../components/PlotPicker";
import { PlotRowDialog, RemoveEmptyRowsButton } from "../components/PlotRowTools";
import { ManuscriptExportDialog } from "../components/ManuscriptExportDialog";

/**
 * One plot against the tome's spine. It draws through `PlotGrid` with a single
 * column, which is the whole of what makes this page and `PlotComparePage` the
 * same picture: the gutter names the same rows, the track and dots look the way
 * the old `PlotTimeline` did, and adding a second column is the only difference
 * between the two screens.
 *
 * The grid gets no column header here. `PlotPicker` sits directly above it with
 * this plot's tab selected and its own "Add item" button, so a header would name
 * the plot a third time on one screen.
 */
export function PlotPage({
  creating = false,
  exporting = false,
}: {
  creating?: boolean;
  exporting?: boolean;
}) {
  const { plotId, itemId, index, rowId } = useParams<{
    plotId?: string;
    itemId?: string;
    index?: string;
    rowId?: string;
  }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();
  const [compareMenu, setCompareMenu] = useState<HTMLElement | null>(null);
  const [newPlotOpen, setNewPlotOpen] = useState(false);

  const plots = useObservable<Plot[]>((cb) => store.observePlots(tome!.id, cb), [tome?.id]);
  const rows =
    useObservable<PlotRow[]>((cb) => store.observePlotRows(tome!.id, cb), [tome?.id]) ?? [];
  // Every beat in the tome rather than this plot's alone: the spine is tome-wide,
  // so "which rows are empty" is a question about all of them — a row this plot
  // has nothing on may still be occupied by a plot that is not on screen.
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

  // `observeTomePlotItems` reads the `tomeId` index, so unlike `observePlotItems`
  // it arrives unordered — and the manuscript export reads beats in `sortOrder`.
  const items = useMemo(
    () =>
      allItems
        .filter((item) => item.plotId === plotId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allItems, plotId],
  );

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
  const editingItem = itemId ? items.find((item) => item.id === itemId) : undefined;
  // `:rowId` serves both the rename route and the insert route; `creating` says which.
  const renamingRow = !creating && rowId ? rows.find((row) => row.id === rowId) : undefined;
  const others = plots.filter((candidate) => candidate.id !== plot.id);

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
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Tooltip
            title={
              others.length
                ? "Show this plot beside another one"
                : "Create a second plot to compare timelines"
            }
          >
            {/* A disabled button fires no events, so the tooltip needs a live wrapper. */}
            <span>
              <Button
                startIcon={<CompareArrowsIcon />}
                disabled={!others.length}
                onClick={(event) => setCompareMenu(event.currentTarget)}
              >
                Compare
              </Button>
            </span>
          </Tooltip>
          <Menu
            anchorEl={compareMenu}
            open={Boolean(compareMenu)}
            onClose={() => setCompareMenu(null)}
          >
            {others.map((other) => (
              <MenuItem
                key={other.id}
                onClick={() => {
                  setCompareMenu(null);
                  navigate(`/tomes/${tome.id}/plots/compare/${plot.id},${other.id}`);
                }}
              >
                {other.name}
              </MenuItem>
            ))}
          </Menu>
          <RemoveEmptyRowsButton tomeId={tome.id} rows={rows} tomeItems={allItems} />
          <Tooltip
            title={
              items.length
                ? "Turn this plot line into a Word or PDF manuscript"
                : "Add a beat before exporting a manuscript"
            }
          >
            <span>
              <Button
                startIcon={<IosShareIcon />}
                disabled={!items.length}
                onClick={() => navigate(`${plotPath}/export`)}
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
        current={plot}
        newPlotOpen={newPlotOpen}
        onCloseNewPlot={() => setNewPlotOpen(false)}
        onAddItem={() => navigate(`${plotPath}/insert/${items.length}`)}
      />

      <PlotGrid
        tomeId={tome.id}
        rows={rows}
        plots={[plot]}
        items={items}
        types={types}
        elements={elements}
        onOpenItem={(item) => navigate(`${plotPath}/items/${item.id}`)}
        onOpenElement={(element) =>
          navigate(`/tomes/${tome.id}/elements/${element.elementTypeId}/${element.id}`)
        }
        onWrite={(item) => navigate(`${plotPath}/items/${item.id}/write`)}
        onAddBeat={(_, targetRow) => navigate(`${plotPath}/insert/row/${targetRow}`)}
        onRenameRow={(row) => navigate(`${plotPath}/rows/${row.id}`)}
      />

      <PlotItemDialog
        open={Boolean(editingItem) || (creating && (insertAt !== undefined || Boolean(rowId)))}
        item={editingItem}
        insertAt={insertAt}
        // Only a create carries a row from the route; an edit keeps the one it has.
        plotRowId={creating ? rowId : undefined}
        tomeId={tome.id}
        plotId={plot.id}
        elements={elements}
        types={types}
        onOpenManuscript={(item) => navigate(`${plotPath}/items/${item.id}/write`)}
        onClose={closeDialog}
      />

      <PlotRowDialog row={renamingRow} onClose={closeDialog} />

      {exporting && (
        <ManuscriptExportDialog
          tomeTitle={tome.title}
          plot={plot}
          beats={items}
          writeItems={writeItems}
          onClose={closeDialog}
        />
      )}
    </Box>
  );
}
