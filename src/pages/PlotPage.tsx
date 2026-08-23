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
import type { Element } from "../models/Element";
import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { PlotTimeline } from "../components/PlotTimeline";
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
  const [compareMenu, setCompareMenu] = useState<HTMLElement | null>(null);
  const [newPlotOpen, setNewPlotOpen] = useState(false);

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

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

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
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
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

      <PlotTimeline
        plotId={plot.id}
        items={items}
        types={types}
        elements={elements}
        onOpenItem={(item) => navigate(`${plotPath}/items/${item.id}`)}
        onInsert={(position) => navigate(`${plotPath}/insert/${position}`)}
        onOpenElement={(element) =>
          navigate(`/tomes/${tome.id}/elements/${element.elementTypeId}/${element.id}/edit`)
        }
      />

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
