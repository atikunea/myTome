import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import type { Element } from "../models/Element";
import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { PlotTimeline } from "../components/PlotTimeline";
import { PlotItemDialog } from "../components/PlotItemDialog";

/**
 * Two of a tome's plots drawn beside each other — a subplot against the main
 * line, two POV threads, a draft against its rewrite. Both sides stay editable:
 * each column is a full `PlotTimeline`, so beats can be opened, inserted, and
 * reordered without leaving the comparison. Dragging is per-column by design;
 * a beat belongs to one plot, and moving it between plots is not a reorder.
 */
export function PlotComparePage({ creating = false }: { creating?: boolean }) {
  const { plotId, otherPlotId, itemId, sidePlotId, index } = useParams<{
    plotId: string;
    otherPlotId: string;
    itemId?: string;
    sidePlotId?: string;
    index?: string;
  }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();

  const plots = useObservable<Plot[]>((cb) => store.observePlots(tome!.id, cb), [tome?.id]);
  const leftItems =
    useObservable<PlotItem[]>((cb) => store.observePlotItems(plotId ?? "", cb), [plotId]) ?? [];
  const rightItems =
    useObservable<PlotItem[]>(
      (cb) => store.observePlotItems(otherPlotId ?? "", cb),
      [otherPlotId],
    ) ?? [];
  const elements =
    useObservable<Element[]>((cb) => store.observeTomeElements(tome!.id, cb), [tome?.id]) ?? [];
  const writeItems =
    useObservable<WriteItem[]>((cb) => store.observeWriteItems(tome!.id, cb), [tome?.id]) ?? [];

  const byId = useMemo(
    () => new Map([...leftItems, ...rightItems].map((item) => [item.id, item])),
    [leftItems, rightItems],
  );

  // Comparing a plot with itself is not a comparison — a hand-edited URL that
  // asks for one falls back to the ordinary single-plot view.
  useEffect(() => {
    if (!tome || !plotId || plotId !== otherPlotId) return;
    navigate(`/tomes/${tome.id}/plots/${plotId}`, { replace: true });
  }, [tome, plotId, otherPlotId, navigate]);

  if (!tome || !plots || !plotId || !otherPlotId) return null;
  const left = plots.find((plot) => plot.id === plotId);
  const right = plots.find((plot) => plot.id === otherPlotId);
  if (!left || !right)
    return (
      <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
        Plot not found
      </Typography>
    );

  const comparePath = `/tomes/${tome.id}/plots/${left.id}/compare/${right.id}`;
  const closeDialog = () => navigate(comparePath);
  const editingItem = itemId ? byId.get(itemId) : undefined;
  // The insert route names the plot as well as the position: with two timelines
  // on screen an index alone does not say which one is being added to.
  const insertPlotId =
    creating && sidePlotId === left.id
      ? left.id
      : creating && sidePlotId === right.id
        ? right.id
        : undefined;
  const insertAt = insertPlotId && index !== undefined ? Number(index) : undefined;

  const columns = [
    { plot: left, items: leftItems, pairWith: (id: string) => `${id}/compare/${right.id}` },
    { plot: right, items: rightItems, pairWith: (id: string) => `${left.id}/compare/${id}` },
  ];

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
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          <Tooltip title="Swap sides">
            <IconButton
              aria-label="Swap sides"
              onClick={() => navigate(`/tomes/${tome.id}/plots/${right.id}/compare/${left.id}`)}
            >
              <SwapHorizIcon />
            </IconButton>
          </Tooltip>
          <Button
            startIcon={<CloseIcon />}
            onClick={() => navigate(`/tomes/${tome.id}/plots/${left.id}`)}
          >
            Exit compare
          </Button>
        </Stack>
      </Stack>

      <Stack
        // Two timelines need more room than the app's usual `sm` switch gives
        // them: each column carries its own spine, labels, and cards, so they
        // stay stacked until `md` and only then sit side by side.
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 4, md: 3 }}
        sx={{ alignItems: "flex-start" }}
      >
        {columns.map(({ plot, items, pairWith }) => (
          <Box key={plot.id} sx={{ flex: 1, minWidth: 0, width: "100%" }}>
            <Stack
              direction="row"
              sx={{
                alignItems: "center",
                gap: 1,
                pb: 1.5,
                mb: 2,
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <TextField
                select
                size="small"
                label="Plot"
                value={plot.id}
                onChange={(event) =>
                  navigate(`/tomes/${tome.id}/plots/${pairWith(event.target.value)}`)
                }
                sx={{ flex: 1, minWidth: 0 }}
              >
                {plots.map((option) => (
                  <MenuItem
                    key={option.id}
                    value={option.id}
                    // The other column already has it; a plot cannot face itself.
                    disabled={option.id !== plot.id && columns.some((c) => c.plot.id === option.id)}
                  >
                    {option.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                size="small"
                startIcon={<AddIcon />}
                sx={{ flexShrink: 0 }}
                onClick={() => navigate(`${comparePath}/insert/${plot.id}/${items.length}`)}
              >
                Add item
              </Button>
            </Stack>

            <PlotTimeline
              plotId={plot.id}
              items={items}
              types={types}
              elements={elements}
              onOpenItem={(item) => navigate(`${comparePath}/items/${item.id}`)}
              onInsert={(position) =>
                navigate(`${comparePath}/insert/${plot.id}/${position}`)
              }
              onOpenElement={(element) =>
                navigate(`/tomes/${tome.id}/elements/${element.elementTypeId}/${element.id}/edit`)
              }
            />
          </Box>
        ))}
      </Stack>

      <PlotItemDialog
        open={Boolean(editingItem) || insertAt !== undefined}
        item={editingItem}
        insertAt={insertAt}
        tomeId={tome.id}
        // An existing beat carries the plot it belongs to; only a new one takes
        // the plot from the route.
        plotId={editingItem?.plotId ?? insertPlotId ?? left.id}
        elements={elements}
        types={types}
        writeItems={writeItems}
        onOpenWriteItem={(writeItemId) => navigate(`/tomes/${tome.id}/write/${writeItemId}`)}
        onClose={closeDialog}
      />
    </Box>
  );
}
