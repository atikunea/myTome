import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineOppositeContent from "@mui/lab/TimelineOppositeContent";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineDot from "@mui/lab/TimelineDot";
import TimelineContent from "@mui/lab/TimelineContent";
import type { PlotItem } from "../models/Plot";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import { ElementTypeIcon } from "./ElementTypeIcon";
import { PlotBeatCard } from "./PlotBeatCard";
import { TimelineConnectorInsert } from "./TimelineConnectorInsert";

/** Width of a `TimelineDot` wrapping a default-size icon: 24px icon + 8px padding + 4px border. */
const ICON_DOT_SIZE = 36;

/**
 * One row of the plot timeline: the label column, the track with its dot and its
 * insert affordances, and a `PlotBeatCard` for the beat itself. This renders a
 * MUI `TimelineItem` as its own root rather than wrapping one — `Timeline`
 * distributes its `position` through React context, and an intervening element
 * would break the row's layout grid. The sortable ref and transform therefore
 * land on the `TimelineItem`, and the handle's wiring is passed down to the card.
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
        <PlotBeatCard
          item={item}
          attachments={attachments}
          types={types}
          onOpen={onOpen}
          onOpenElement={onOpenElement}
          // The label column beside the track already carries `item.name`, so the
          // card repeats it only at the width where that column is hidden.
          labelMode="compact"
          dragHandle={{ attributes, listeners, setActivatorNodeRef }}
        />
      </TimelineContent>
    </TimelineItem>
  );
}
