import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Grid,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import {
  untitledWriteItem,
  writeItemTypeLabels,
  writeItemTypes,
} from "../models/WriteItem";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { useObservable } from "../hooks/useObservable";
import { EmptyState } from "../components/EmptyState";
import { WriteItemCard } from "../components/WriteItemCard";
import { WriteItemTypeIcon } from "../components/WriteItemTypeIcon";

type SortMode = "recent" | "story" | "alpha";

/** Sorts before every real story key, parking uncomposed items at the end. */
const UNCOMPOSED: StoryKey = [Infinity, Infinity, Infinity];
type StoryKey = [number, number, number];

const compareKeys = (a: StoryKey, b: StoryKey) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Where each write item sits in the manuscript: its earliest composing beat,
 * as (plot position, beat position, position within that beat). An item
 * composed into several beats takes its first one.
 */
function storyKeys(plots: Plot[], beats: PlotItem[]) {
  const plotOrder = new Map(plots.map((plot) => [plot.id, plot.sortOrder]));
  const keys = new Map<string, StoryKey>();
  for (const beat of beats) {
    beat.writeItemIds.forEach((id, index) => {
      const key: StoryKey = [
        plotOrder.get(beat.plotId) ?? Infinity,
        beat.sortOrder,
        index,
      ];
      const current = keys.get(id);
      if (!current || compareKeys(key, current) < 0) keys.set(id, key);
    });
  }
  return keys;
}

export function WriteListPage() {
  const { tome } = useTomeWorkspace();
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [typeFilter, setTypeFilter] = useState<WriteItemType | "all">("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [newMenu, setNewMenu] = useState<HTMLElement | null>(null);

  const items =
    useObservable<WriteItem[]>(
      (cb) => store.observeWriteItems(tome!.id, cb),
      [tome?.id],
    ) ?? [];
  const plots =
    useObservable<Plot[]>((cb) => store.observePlots(tome!.id, cb), [tome?.id]) ?? [];
  const beats =
    useObservable<PlotItem[]>(
      (cb) => store.observeTomePlotItems(tome!.id, cb),
      [tome?.id],
    ) ?? [];

  const keys = useMemo(() => storyKeys(plots, beats), [plots, beats]);

  const visible = useMemo(() => {
    const filtered = items.filter(
      (item) => typeFilter === "all" || item.type === typeFilter,
    );
    return filtered.sort((a, b) => {
      if (sort === "alpha")
        return (a.title || untitledWriteItem).localeCompare(
          b.title || untitledWriteItem,
        );
      if (sort === "story") {
        const byStory = compareKeys(
          keys.get(a.id) ?? UNCOMPOSED,
          keys.get(b.id) ?? UNCOMPOSED,
        );
        // Uncomposed items all share the sentinel key, so they fall back to
        // recency among themselves rather than to insertion order.
        if (byStory) return byStory;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [items, typeFilter, sort, keys]);

  if (!tome) return null;

  const create = async (type: WriteItemType) => {
    setNewMenu(null);
    const item = await store.createDraftWriteItem(tome.id, type);
    navigate(`/tomes/${tome.id}/write/${item.id}`);
  };

  return (
    <Box>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 3.25 }}
      >
        <Box>
          <Typography
            variant="overline"
            color="primary"
            sx={{ fontWeight: 800, letterSpacing: "0.12em" }}
          >
            WRITE
          </Typography>
          <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
            Text
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          endIcon={<ArrowDropDownIcon />}
          onClick={(event) => setNewMenu(event.currentTarget)}
        >
          New
        </Button>
        <Menu
          anchorEl={newMenu}
          open={Boolean(newMenu)}
          onClose={() => setNewMenu(null)}
        >
          {writeItemTypes.map((type) => (
            <MenuItem key={type} onClick={() => create(type)}>
              <WriteItemTypeIcon
                type={type}
                fontSize="small"
                sx={{ mr: 1.25, color: "text.secondary" }}
              />
              {writeItemTypeLabels[type]}
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", mb: 3.5 }}>
        <TextField
          select
          label="Type"
          value={typeFilter}
          onChange={(event) =>
            setTypeFilter(event.target.value as WriteItemType | "all")
          }
          size="small"
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="all">All types</MenuItem>
          {writeItemTypes.map((type) => (
            <MenuItem key={type} value={type}>
              {writeItemTypeLabels[type]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortMode)}
          size="small"
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="recent">Recently updated</MenuItem>
          <MenuItem value="story">Story order</MenuItem>
          <MenuItem value="alpha">Alphabetical</MenuItem>
        </TextField>
      </Stack>

      {visible.length ? (
        <Grid container spacing={2}>
          {visible.map((item) => (
            <Grid key={item.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <WriteItemCard
                item={item}
                onOpen={() => navigate(`/tomes/${tome.id}/write/${item.id}`)}
                onDelete={() =>
                  confirmAction(
                    `Permanently delete "${item.title.trim() || untitledWriteItem}"? This cannot be undone.`,
                    async () => {
                      await store.deleteWriteItem(item.id);
                    },
                  )
                }
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <EmptyState
          title={
            items.length ? "Nothing of that type yet" : "Nothing written yet"
          }
          body={
            items.length
              ? "Try a different type filter, or start a new piece."
              : "Start a snippet, some lore, a passage, or a chapter."
          }
        />
      )}
    </Box>
  );
}
