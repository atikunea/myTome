import type { FormEvent } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Tooltip,
} from "@mui/material";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import type { PlotItem, PlotRow } from "../models/Plot";
import { store } from "../services/store";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Naming a spine row, mounted by the `rows/:rowId` route on both plot views.
 *
 * The spine belongs to the tome rather than to a plot, so these two controls are
 * the same control wherever they appear — which is exactly why they live here
 * and not in either page. `PlotGrid` owns the rest of the row actions (insert,
 * delete) because it owns the buttons; renaming is the one that needs a route,
 * so it stays with the page that has the router.
 */
export function PlotRowDialog({
  row,
  onClose,
}: {
  /** The row being named, or undefined when the route names none. */
  row?: PlotRow;
  onClose: () => void;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!row) return;
    store.setPlotRowLabel(row.id, String(new FormData(event.currentTarget).get("label") ?? ""));
    onClose();
  };

  return (
    <Dialog open={Boolean(row)} onClose={onClose} maxWidth="xs" fullWidth>
      {/*
        Keyed on the row so the uncontrolled field re-seeds: MUI keeps a dialog's
        children mounted until the close transition ends, and without this,
        renaming one row and then another reopens carrying the first one's label.
      */}
      <Box component="form" onSubmit={handleSubmit} key={row?.id}>
        <DialogTitle>Name this row</DialogTitle>
        <DialogContent dividers>
          <TextField
            name="label"
            label="Row label"
            fullWidth
            autoFocus
            defaultValue={row?.label ?? ""}
            helperText="Shown in the gutter beside every plot, e.g. Act I or Day 12"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            Save
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/**
 * Drops every row no plot in the tome stands on. Deliberately counted against
 * `items` for the *whole tome* rather than the rows on screen: the spine is
 * tome-wide, so a row can be empty in every visible column and still be occupied
 * by a plot that isn't. Hand it `store.observeTomePlotItems`, not one plot's.
 */
export function RemoveEmptyRowsButton({
  tomeId,
  rows,
  tomeItems,
}: {
  tomeId: string;
  rows: PlotRow[];
  /** Every beat in the tome, not just the ones on screen. */
  tomeItems: PlotItem[];
}) {
  const held = new Set(tomeItems.map((item) => item.plotRowId));
  const empty = rows.filter((row) => !held.has(row.id)).length;
  return (
    <Tooltip
      title={
        empty ? `Drop ${plural(empty, "row")} no plot has a beat on` : "No empty rows to remove"
      }
    >
      {/* A disabled button fires no events, so the tooltip needs a live wrapper. */}
      <span>
        <Button
          startIcon={<UnfoldLessIcon />}
          disabled={!empty}
          onClick={() => store.removeEmptyPlotRows(tomeId)}
        >
          Remove empty rows
        </Button>
      </span>
    </Tooltip>
  );
}
