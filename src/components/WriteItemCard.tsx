import { useEffect, useRef, useState } from "react";
import { Box, Card, Popover, Stack, Tooltip, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import type { WriteItem } from "../models/WriteItem";
import { untitledWriteItem, writeItemTypeLabels } from "../models/WriteItem";
import { WriteItemTypeIcon } from "./WriteItemTypeIcon";

/** How long the pointer must rest on a card before its sample appears. */
const HOVER_DELAY_MS = 250;

/**
 * A small, title-only card in the Write grid. The hover sample is owned here
 * rather than by the page so each card keeps its own timer — the page would
 * otherwise have to track which of n cards is being hovered.
 */
export function WriteItemCard({
  item,
  onOpen,
  onDelete,
}: {
  item: WriteItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef<number>(undefined);
  const title = item.title.trim() || untitledWriteItem;

  // A card can unmount mid-hover (a delete, a filter change), which would leave
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

  return (
    <>
      <Card
        variant="outlined"
        role="button"
        tabIndex={0}
        aria-label={`Edit ${title}`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        onMouseEnter={scheduleOpen}
        onMouseLeave={cancelOpen}
        sx={{
          p: 1.75,
          cursor: "pointer",
          height: "100%",
          transition: "border-color 120ms ease",
          "&:hover": { borderColor: "primary.main" },
          "&:hover .write-card-delete, & .write-card-delete:focus-visible": {
            opacity: 1,
          },
          "&:focus-visible": {
            outline: 2,
            outlineColor: "primary.main",
            outlineOffset: 2,
          },
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <WriteItemTypeIcon
            type={item.type}
            fontSize="small"
            sx={{ color: "text.secondary", mt: 0.25, flexShrink: 0 }}
          />
          <Typography
            sx={{
              flex: 1,
              minWidth: 0,
              fontWeight: 600,
              lineHeight: 1.35,
              overflowWrap: "anywhere",
            }}
          >
            {title}
          </Typography>
          <Tooltip title="Delete">
            <Box
              component="button"
              type="button"
              className="write-card-delete"
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
                opacity: 0,
                transition: "opacity 120ms ease",
                "&:hover": { bgcolor: "action.hover", color: "error.main" },
              }}
            >
              <DeleteIcon fontSize="small" />
            </Box>
          </Tooltip>
        </Stack>
      </Card>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={cancelOpen}
        disableRestoreFocus
        // The sample follows the pointer's card, so it must never become the
        // pointer's target — that would bounce mouseleave off the card below.
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
