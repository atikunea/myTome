import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Box, Card, Chip, Stack, Tooltip, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import type { PlotItem } from "../models/Plot";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import { ElementTypeIcon } from "./ElementTypeIcon";

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
  dragHandle,
  labelMode = "always",
}: {
  item: PlotItem;
  attachments: Element[];
  types: ElementType[];
  onOpen: () => void;
  onOpenElement: (element: Element) => void;
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
          <Typography variant="h6" component="h3" sx={{ fontSize: "1.15rem" }}>
            {item.title}
          </Typography>
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
      </Stack>
    </Card>
  );
}
