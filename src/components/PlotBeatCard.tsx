import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Badge, Box, Card, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditNoteIcon from "@mui/icons-material/EditNote";
import type { PlotDotColor, PlotItem } from "../models/Plot";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import { ElementTypeIcon } from "./ElementTypeIcon";

/** `PlotDotColor` as a theme token — "grey" is not a palette entry with a `.main`. */
const dotToken = (color: PlotDotColor) => (color === "grey" ? "grey.500" : `${color}.main`);

/**
 * The beat's dot, drawn on the card. `TimelineCard` gets this from MUI's
 * `TimelineDot` on the track; a grid cell has no track, so the same three
 * properties — colour, variant, icon — are rendered here instead.
 */
function BeatDot({ item }: { item: PlotItem }) {
  const token = dotToken(item.dotColor ?? "grey");
  const filled = (item.dotVariant ?? "filled") === "filled";
  return (
    <Box
      aria-hidden
      sx={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        width: item.icon ? 28 : 12,
        height: item.icon ? 28 : 12,
        border: filled ? 0 : 2,
        borderColor: token,
        bgcolor: filled ? token : "transparent",
        color: filled ? "common.white" : token,
      }}
    >
      {item.icon ? <ElementTypeIcon icon={item.icon} fontSize="small" /> : null}
    </Box>
  );
}

/**
 * The beat itself — title, description, attached elements, and the handle that
 * drags it. Deliberately knows nothing about what it sits inside: `TimelineCard`
 * puts one in a MUI `TimelineContent`, and the compare grid puts one in a grid
 * cell, which is the whole reason this is not part of `TimelineCard` any more.
 *
 * It does not call `useSortable` itself. Whichever container registered the beat
 * as draggable owns the node ref and the transform, and passes the handle's
 * wiring down through `dragHandle` — in a grid the draggable node is the cell,
 * not the card.
 */
export function PlotBeatCard({
  item,
  attachments,
  types,
  onOpen,
  onOpenElement,
  onWrite,
  dragHandle,
  labelMode = "always",
  showDot = false,
}: {
  item: PlotItem;
  attachments: Element[];
  types: ElementType[];
  onOpen: () => void;
  onOpenElement: (element: Element) => void;
  /**
   * Opens the beat's manuscript. This is the way in to a beat's writing now
   * that composition has left `PlotItemDialog`, so unlike the drag handle it is
   * **always visible** rather than revealed on hover — a hover-only control is
   * unreachable on touch, and this is not a secondary action.
   */
  onWrite: (item: PlotItem) => void;
  /** Handle wiring from the container's `useSortable`. Omit where a beat cannot be dragged. */
  dragHandle?: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
    setActivatorNodeRef: (element: HTMLElement | null) => void;
  };
  /**
   * Where the beat label is drawn. `"compact"` shows it only below `sm`, for the
   * timeline, whose own label column disappears at that width; `"always"` for a
   * layout that has no label column of its own.
   */
  labelMode?: "always" | "compact";
  /** Draws the beat's dot on the card, for a layout with no track to carry it. */
  showDot?: boolean;
}) {
  return (
    <Card
      variant="outlined"
      role="button"
      tabIndex={0}
      aria-label={`Edit ${item.title}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        // The card is the click target for editing, so it needs the keyboard
        // activation a real button would give it for free.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      sx={{
        p: 2,
        cursor: "pointer",
        transition: "border-color 120ms ease",
        // The reveal lives here rather than on the container so that a card
        // carries its own handle affordance into whatever layout holds it.
        "&:hover .drag-handle": { opacity: 1 },
        "&:hover": { borderColor: "primary.main" },
        "&:focus-visible": {
          outline: 2,
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        {dragHandle ? (
          <Tooltip title="Drag to reorder">
            {/*
              A plain button, not MUI's IconButton: ButtonBase routes key events
              through its own `getButtonProps` wrapper, which swallows the
              `onKeyDown` that dnd-kit's KeyboardSensor needs to start a lift.
            */}
            <Box
              component="button"
              type="button"
              className="drag-handle"
              ref={dragHandle.setActivatorNodeRef}
              aria-label={`Reorder ${item.title}`}
              onClick={(event: React.MouseEvent) => event.stopPropagation()}
              sx={{
                mt: -0.25,
                ml: -0.5,
                p: 0.5,
                display: "inline-flex",
                border: 0,
                borderRadius: "50%",
                bgcolor: "transparent",
                color: "text.secondary",
                cursor: "grab",
                touchAction: "none",
                opacity: 0,
                transition: "opacity 120ms ease",
                "&:hover": { bgcolor: "action.hover" },
                "&:focus-visible": { opacity: 1 },
                "&:active": { cursor: "grabbing" },
              }}
              {...dragHandle.attributes}
              {...dragHandle.listeners}
            >
              <DragIndicatorIcon fontSize="small" />
            </Box>
          </Tooltip>
        ) : null}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {item.name ? (
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{
                display: labelMode === "always" ? "block" : { xs: "block", sm: "none" },
                lineHeight: 1.6,
              }}
            >
              {item.name}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {showDot ? <BeatDot item={item} /> : null}
            <Typography variant="h6" component="h3" sx={{ fontSize: "1.15rem", minWidth: 0 }}>
              {item.title}
            </Typography>
          </Stack>
          {item.description ? (
            <Typography color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
              {item.description}
            </Typography>
          ) : null}
          {attachments.length ? (
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
              {attachments.map((element) => {
                const type = types.find((t) => t.id === element.elementTypeId);
                return (
                  <Chip
                    key={element.id}
                    size="small"
                    variant="outlined"
                    icon={<ElementTypeIcon icon={type?.icon} fontSize="small" />}
                    label={element.name}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenElement(element);
                    }}
                  />
                );
              })}
            </Stack>
          ) : null}
        </Box>
        <Tooltip
          title={
            item.writeItemIds.length
              ? `Write — ${item.writeItemIds.length} ${item.writeItemIds.length === 1 ? "text" : "texts"}`
              : "Write"
          }
        >
          <IconButton
            size="small"
            aria-label={`Write ${item.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onWrite(item);
            }}
            sx={{ mt: -0.5, mr: -0.5, color: "text.secondary", flexShrink: 0 }}
          >
            <Badge
              badgeContent={item.writeItemIds.length}
              color="primary"
              overlap="circular"
              slotProps={{ badge: { sx: { fontSize: 10, height: 15, minWidth: 15 } } }}
            >
              <EditNoteIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
      </Stack>
    </Card>
  );
}
