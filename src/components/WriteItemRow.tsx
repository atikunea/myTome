import { useEffect, useRef, useState } from "react";
import {
  Box,
  Link,
  Popover,
  Stack,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { WriteItem } from "../models/WriteItem";
import { untitledWriteItem, writeItemTypeLabels } from "../models/WriteItem";
import type { WriteItemUse } from "../services/storyOrder";
import { WriteItemTypeIcon } from "./WriteItemTypeIcon";

/** How long the pointer must rest on a row before its sample appears. */
const HOVER_DELAY_MS = 250;

/** Beyond this, a date is more useful than a count of days. */
const RELATIVE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Today", "3 days ago", "14 Aug" — recency read at a glance for the week that
 * matters, and a plain date once counting days stops helping. The exact stamp
 * is a hover away, so nothing is actually lost to the rounding.
 */
function updatedLabel(updatedAt: string, now: number) {
  const then = new Date(updatedAt);
  if (Number.isNaN(then.getTime())) return "—";
  const days = Math.floor((now - then.getTime()) / DAY_MS);
  if (days < 0 || days >= RELATIVE_DAYS)
    return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/** "Main · Departure", or "3 beats" once naming them all would not fit. */
function usedInLabel(uses: WriteItemUse[]) {
  if (!uses.length) return "Not used";
  if (uses.length === 1) return `${uses[0].plotName} · ${uses[0].beatTitle}`;
  return `${uses.length} beats`;
}

/**
 * One row of the Write table.
 *
 * The hover sample is owned here rather than by the page, the way it was in the
 * card this replaces: the page would otherwise have to track which of n rows is
 * being hovered, and each row keeps its own timer for free.
 *
 * The row is clickable, but the title is a real button as well — a `<tr>` with
 * a click handler is unreachable from the keyboard, and giving the row itself a
 * button role would cost the table its semantics. So the mouse gets the whole
 * row and the keyboard gets the title, which is also the accessible name.
 */
export function WriteItemRow({
  item,
  uses,
  now,
  onOpen,
  onDelete,
}: {
  item: WriteItem;
  /** Every beat composing this text, in reading order. */
  uses: WriteItemUse[];
  /** Fixed by the page for the whole render, so no two rows disagree on today. */
  now: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef<number>(undefined);
  const title = item.title.trim() || untitledWriteItem;

  // A row can unmount mid-hover (a delete, a filter change), which would leave
  // the timer to fire setState on a gone component.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const scheduleOpen = (event: React.MouseEvent<HTMLElement>) => {
    // Read the element now: `currentTarget` is nulled once the handler returns.
    const element = event.currentTarget;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAnchor(element), HOVER_DELAY_MS);
  };
  const cancelOpen = () => {
    window.clearTimeout(timer.current);
    setAnchor(null);
  };

  const hideBelowSm = { display: { xs: "none", sm: "table-cell" } } as const;

  return (
    <>
      <TableRow
        hover
        onClick={onOpen}
        onMouseEnter={scheduleOpen}
        onMouseLeave={cancelOpen}
        sx={{
          cursor: "pointer",
          "&:hover .write-row-delete, &:focus-within .write-row-delete": {
            opacity: 1,
          },
        }}
      >
        <TableCell sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <WriteItemTypeIcon type={item.type} fontSize="small" />
            <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
              {writeItemTypeLabels[item.type]}
            </Box>
          </Stack>
        </TableCell>
        <TableCell>
          <Link
            component="button"
            type="button"
            underline="hover"
            color="inherit"
            // The row already opens the item; without this the click would run
            // both handlers and navigate twice.
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            sx={{
              fontWeight: 600,
              textAlign: "left",
              lineHeight: 1.4,
              overflowWrap: "anywhere",
              color: item.title.trim() ? "text.primary" : "text.secondary",
            }}
          >
            {title}
          </Link>
        </TableCell>
        <TableCell
          sx={{
            ...hideBelowSm,
            color: uses.length ? "text.secondary" : "text.disabled",
          }}
        >
          {uses.length > 1 ? (
            <Tooltip
              title={uses
                .map((use) => `${use.plotName} · ${use.beatTitle}`)
                .join("\n")}
              slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
            >
              <Box component="span">{usedInLabel(uses)}</Box>
            </Tooltip>
          ) : (
            usedInLabel(uses)
          )}
        </TableCell>
        <TableCell sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
          <Tooltip title={new Date(item.updatedAt).toLocaleString()}>
            <Box component="span">{updatedLabel(item.updatedAt, now)}</Box>
          </Tooltip>
        </TableCell>
        <TableCell
          align="right"
          sx={{
            ...hideBelowSm,
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {item.wordCount.toLocaleString()}
        </TableCell>
        <TableCell align="right" sx={{ width: 48, py: 0 }}>
          <Tooltip title="Delete">
            <Box
              component="button"
              type="button"
              className="write-row-delete"
              aria-label={`Delete ${title}`}
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                onDelete();
              }}
              sx={{
                p: 0.25,
                display: "inline-flex",
                border: 0,
                borderRadius: "50%",
                bgcolor: "transparent",
                color: "text.secondary",
                cursor: "pointer",
                // Revealed on hover on a pointer device, where a column of
                // delete buttons would be an invitation. A phone has no hover
                // to reveal it with, so below `sm` it simply stays.
                opacity: { xs: 1, sm: 0 },
                transition: "opacity 120ms ease",
                "&:hover": { bgcolor: "action.hover", color: "error.main" },
                "&:focus-visible": { opacity: 1 },
              }}
            >
              <DeleteIcon fontSize="small" />
            </Box>
          </Tooltip>
        </TableCell>
      </TableRow>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={cancelOpen}
        disableRestoreFocus
        // The sample follows the pointer's row, so it must never become the
        // pointer's target — that would bounce mouseleave off the row below.
        sx={{ pointerEvents: "none" }}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxWidth: 380, p: 1.75 } } }}
      >
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: "block", lineHeight: 1.6 }}
        >
          {writeItemTypeLabels[item.type]}
        </Typography>
        <Typography
          variant="body2"
          color={item.preview.trim() ? "text.primary" : "text.secondary"}
          sx={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}
        >
          {item.preview.trim() || "No text yet."}
        </Typography>
      </Popover>
    </>
  );
}
