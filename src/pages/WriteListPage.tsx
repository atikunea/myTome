import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import SearchIcon from "@mui/icons-material/Search";
import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import {
  untitledWriteItem,
  writeItemTypeLabels,
  writeItemTypes,
} from "../models/WriteItem";
import { store } from "../services/store";
import {
  defaultDirection,
  sortWriteItems,
  storyKeys,
  writeItemUses,
  type SortDirection,
  type WriteSort,
} from "../services/storyOrder";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { useObservable } from "../hooks/useObservable";
import { EmptyState } from "../components/EmptyState";
import { WriteItemRow } from "../components/WriteItemRow";
import { WriteItemTypeIcon } from "../components/WriteItemTypeIcon";

/**
 * The table's columns. Each header sorts, so the list has no sort control of
 * its own: "Used in" *is* story order (a text's earliest composing beat is what
 * `storyKeys` ranks by), which is why five columns cover what the old dropdown's
 * three modes did and two more besides.
 *
 * "Used in" and "Words" fold away below `sm`, where the workspace nav is
 * already a horizontal strip and five columns cannot fit. Type keeps its icon
 * there and loses only its word, and "Updated" stays: which of these was
 * touched last is the question a phone gets asked.
 */
const columns: {
  sort: WriteSort;
  label: string;
  align?: "right";
  hideBelowSm?: boolean;
}[] = [
  { sort: "type", label: "Type" },
  { sort: "alpha", label: "Title" },
  { sort: "story", label: "Used in", hideBelowSm: true },
  { sort: "recent", label: "Updated" },
  { sort: "words", label: "Words", align: "right", hideBelowSm: true },
];

export function WriteListPage() {
  const { tome } = useTomeWorkspace();
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [typeFilter, setTypeFilter] = useState<WriteItemType | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WriteSort>("recent");
  const [direction, setDirection] = useState<SortDirection>(
    defaultDirection.recent,
  );
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
  const uses = useMemo(() => writeItemUses(plots, beats), [plots, beats]);

  const visible = useMemo(
    () => sortWriteItems({ items, typeFilter, query, sort, direction, keys }),
    [items, typeFilter, query, sort, direction, keys],
  );

  // One "now" for the whole table, so two rows cannot be labelled from two
  // different readings of the clock.
  const now = Date.now();

  if (!tome) return null;

  const create = async (type: WriteItemType) => {
    setNewMenu(null);
    const item = await store.createDraftWriteItem(tome.id, type);
    navigate(`/tomes/${tome.id}/write/${item.id}`);
  };

  /** A second click on the sorted column reverses it; a first opens its default. */
  const sortBy = (next: WriteSort) => {
    if (next === sort) setDirection(direction === "asc" ? "desc" : "asc");
    else {
      setSort(next);
      setDirection(defaultDirection[next]);
    }
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
            Write
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

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ mb: 2.5, alignItems: { sm: "center" } }}
      >
        <TextField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search titles and text"
          size="small"
          sx={{ flex: 1, maxWidth: { sm: 340 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
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
      </Stack>

      {visible.length ? (
        <TableContainer component={Paper} variant="outlined">
          <Table
            size="small"
            // MUI's 16px cell padding is four columns' worth of margin on a
            // phone, which is enough to push the table into a scrollbar of its
            // own. The rows fit at 375px with a little taken back.
            sx={{ "& td, & th": { px: { xs: 1.25, sm: 2 } } }}
          >
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={column.sort}
                    align={column.align}
                    sortDirection={sort === column.sort ? direction : false}
                    sx={{
                      whiteSpace: "nowrap",
                      ...(column.hideBelowSm
                        ? { display: { xs: "none", sm: "table-cell" } }
                        : {}),
                    }}
                  >
                    <TableSortLabel
                      active={sort === column.sort}
                      direction={sort === column.sort ? direction : defaultDirection[column.sort]}
                      onClick={() => sortBy(column.sort)}
                    >
                      {column.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                {/* The delete column: a header would name a control that only
                    appears on hover. */}
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((item) => (
                <WriteItemRow
                  key={item.id}
                  item={item}
                  uses={uses.get(item.id) ?? []}
                  now={now}
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
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <EmptyState
          // With rows in the tome but none on screen, the search box or the
          // type filter is the only thing that can have hidden them.
          title={items.length ? "Nothing matches that" : "Nothing written yet"}
          body={
            items.length
              ? "Try a different search or type filter, or start a new piece."
              : "Start a snippet, some lore, a passage, or a chapter."
          }
        />
      )}
    </Box>
  );
}
