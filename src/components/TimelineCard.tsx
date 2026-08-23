import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Box, Card, Chip, Stack, Tooltip, Typography } from "@mui/material";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineOppositeContent from "@mui/lab/TimelineOppositeContent";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineDot from "@mui/lab/TimelineDot";
import TimelineContent from "@mui/lab/TimelineContent";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import type { PlotItem } from "../models/Plot";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import { ElementTypeIcon } from "./ElementTypeIcon";
import { TimelineConnectorInsert } from "./TimelineConnectorInsert";

/** Width of a `TimelineDot` wrapping a default-size icon: 24px icon + 8px padding + 4px border. */
const ICON_DOT_SIZE = 36;

/**
 * One row of the plot timeline. This renders a MUI `TimelineItem` as its own root
 * rather than wrapping one — `Timeline` distributes its `position` through React
 * context, and an intervening element would break the row's layout grid. The
 * sortable ref and transform therefore land on the `TimelineItem` itself.
 */
export function TimelineCard({
  item,
  attachments,
  types,
  onOpen,
  onInsertAbove,
  onInsertBelow,
  onOpenElement,
}: {
  item: PlotItem;
  attachments: Element[];
  types: ElementType[];
  onOpen: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onOpenElement: (element: Element) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <TimelineItem
      ref={setNodeRef}
      sx={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.65 : 1,
        "&:hover .drag-handle": { opacity: 1 },
      }}
    >
      <TimelineOppositeContent
        variant="body2"
        sx={{ color: "text.secondary", m: "auto 0", overflowWrap: "anywhere" }}
      >
        {item.name}
      </TimelineOppositeContent>
      {/*
        The separator is pinned to a fixed width so the track, the cards, and the
        beat labels line up whether or not an item has an icon. Left to size
        itself, the column follows its dot — 36px around an icon, 12px around a
        bare dot — which bends the track and staggers every card beside it.
        This has to be `flex-basis`, not `width`: the separator's own `flex: 0`
        sets `flex-basis: 0%`, and basis beats width on a flex item.
      */}
      <TimelineSeparator sx={{ flex: `0 0 ${ICON_DOT_SIZE}px` }}>
        <TimelineConnectorInsert label="Insert item above" onInsert={onInsertAbove} />
        <TimelineDot
          color={item.dotColor ?? "grey"}
          variant={item.dotVariant ?? "filled"}
          // TimelineDot ships `align-self: baseline`, which in this column flex
          // parent pins a bare dot to the left edge instead of the track.
          sx={{ alignSelf: "center" }}
        >
          {item.icon ? <ElementTypeIcon icon={item.icon} /> : null}
        </TimelineDot>
        <TimelineConnectorInsert label="Insert item below" onInsert={onInsertBelow} />
      </TimelineSeparator>
      <TimelineContent sx={{ py: 1.5, px: 2 }}>
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
            "&:hover": { borderColor: "primary.main" },
            "&:focus-visible": {
              outline: 2,
              outlineColor: "primary.main",
              outlineOffset: 2,
            },
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
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
                ref={setActivatorNodeRef}
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
                {...attributes}
                {...listeners}
              >
                <DragIndicatorIcon fontSize="small" />
              </Box>
            </Tooltip>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {item.name ? (
                // The label column is hidden below `sm`, so carry the label here.
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: { xs: "block", sm: "none" }, lineHeight: 1.6 }}
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
      </TimelineContent>
    </TimelineItem>
  );
}
