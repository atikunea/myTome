import { Button, Tooltip } from "@mui/material";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import type { PlotItem, PlotRow } from "../models/Plot";
import { store } from "../services/store";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
