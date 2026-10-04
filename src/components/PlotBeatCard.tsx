import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Box, Button, Card, Chip, Stack, Tooltip, Typography } from "@mui/material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditNoteIcon from "@mui/icons-material/EditNote";
import type { PlotItem } from "../models/Plot";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { SaveState } from "../hooks/autosave";
import { store } from "../services/store";
import { ElementTypeIcon } from "./ElementTypeIcon";
import { InlineTextField } from "./InlineTextField";

const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/**
 * The beat itself — title, description, attached elements, and the handle that
 * drags it. Deliberately knows nothing about what it sits inside: `PlotGrid`
 * puts one in a cell, beside a track that carries the beat's dot.
 *
 * **The card always draws the beat label** (`item.name`), because the gutter
 * beside it belongs to the spine row. Those are different records — a beat label
 * is one plot's word for a beat, a row label is the whole tome's word for a
 * moment — and they used to take turns in the gutter depending on which view you
 * were in, which is how the spine stayed invisible to anyone who never opened
 * the compare view. The dot moved to the track for the same reason: one place
 * per thing.
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
  onSaveState,
  dragHandle,
  words,
}: {
  item: PlotItem;
  /**
   * The words in the beat's texts, summed. Passed in rather than read here: the
   * card holds only the texts' ids, and the page already has the rows.
   */
  words: number;
  attachments: Element[];
  types: ElementType[];
  onOpen: () => void;
  onOpenElement: (element: Element) => void;
  /**
   * Opens the beat's manuscript. This is the way in to a beat's writing now
   * that composition has left `PlotItemDialog`, so unlike the drag handle it is
   * **always visible** rather than revealed on hover — a hover-only control is
   * unreachable on touch, and this is not a secondary action. Loom gives it the
   * card's foot as a brass pill, which is also what keeps a long title from
   * wrapping around it.
   */
  onWrite: (item: PlotItem) => void;
  /** Where the beat label's autosave reports to. Stable, for `PlotGrid`'s reason. */
  onSaveState: (state: SaveState, retry: () => void) => void;
  /** Handle wiring from the container's drag hook. Omit where a beat cannot be dragged. */
  dragHandle?: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
    setActivatorNodeRef: (element: HTMLElement | null) => void;
  };
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
        // An unnamed beat keeps its label slot but says nothing in it until the
        // card is under the pointer or the field has focus. Most beats never get
        // a label, and a grid of cards each reading "BEAT LABEL" would be worse
        // than the thing it is advertising.
        "& .beat-label input::placeholder": { opacity: 0, transition: "opacity 120ms ease" },
        "&:hover .beat-label input::placeholder, & .beat-label input:focus::placeholder": {
          opacity: 0.5,
        },
        bgcolor: "background.paper",
        "&:hover": { borderColor: (t) => t.loom.brassLine },
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
          {/*
            Always rendered, even with no label to show: it is the only way to
            give a beat one, and a slot that appears on hover would make every
            card jump as the pointer crossed it. The placeholder is what stays
            hidden instead — see the card's `sx` — so a wall of cards reading
            "BEAT LABEL" is not the resting state.

            `typography` on the wrapper rather than the field, and the uppercase
            restated on the input: `InlineTextField` sets `font: inherit`, but
            MUI's own `InputBase-input` resets `text-transform`. Same pair as the
            row gutter in `PlotGrid`.
          */}
          <Box
            className="beat-label"
            sx={{ typography: "overline", color: "text.secondary", lineHeight: 1.6 }}
            // The card is the click target for the dialog, so the field has to
            // keep its own clicks — the same guard the chips and the write
            // button make.
            onClick={(event) => event.stopPropagation()}
          >
            <InlineTextField
              value={item.name}
              placeholder="Beat label"
              ariaLabel={`Beat label for ${item.title}`}
              save={(name) => store.setPlotItemName(item.id, name)}
              onSaveState={onSaveState}
              sx={{ lineHeight: 1.6, "& input": { textTransform: "uppercase" } }}
            />
          </Box>
          <Typography variant="h6" component="h3" sx={{ fontSize: "1.15rem", minWidth: 0 }}>
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
          <Stack direction="row" sx={{ alignItems: "center", mt: 1.5 }}>
            <Typography variant="overline" color="text.secondary" sx={{ flex: 1, lineHeight: 1.6 }}>
              {item.writeItemIds.length
                ? `${plural(words, "word")} · ${plural(item.writeItemIds.length, "text")}`
                : "No text yet"}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditNoteIcon fontSize="small" />}
              aria-label={`Write ${item.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onWrite(item);
              }}
              sx={{ minHeight: 30, py: 0 }}
            >
              Write
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Card>
  );
}
