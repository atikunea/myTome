import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { useState } from "react";
import {
  Box,
  Button,
  Card,
  Chip,
  ListItemIcon,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CancelIcon from "@mui/icons-material/Cancel";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditNoteIcon from "@mui/icons-material/EditNote";
import type { PlotItem } from "../models/Plot";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { SaveState } from "../hooks/autosave";
import { store } from "../services/store";
import { ElementTypeIcon } from "./ElementTypeIcon";
import { InlineTextField } from "./InlineTextField";
import { ElementAttachPicker } from "./ElementAttachPicker";
import { useConfirm } from "../context/ConfirmContext";

/**
 * Attach and Write, side by side in the card's foot. Tighter than MUI's small
 * button so the pair fits a narrow column on one line.
 */
const footButtonSx = {
  minHeight: 30,
  py: 0,
  px: 1,
  minWidth: 0,
  "& .MuiButton-startIcon": { mr: 0.5 },
} as const;

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
 * **Everything on the card is edited where it is drawn** — label, title,
 * description, attachments — each through its own narrow setter, so the card
 * is not a button and opens no dialog. `PlotItemDialog` is the create form; the
 * old `items/:itemId` link still opens it in edit mode so those links resolve.
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
  elements,
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
  /** The tome's elements, for the attach picker. */
  elements: Element[];
  types: ElementType[];
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
      sx={{
        p: 2,
        transition: "border-color 120ms ease",
        // The reveal lives here rather than on the container so that a card
        // carries its own handle affordance into whatever layout holds it.
        // The menu hides only where there is hover to reveal it: a breakpoint is
        // a width, and a tablet wider than `sm` still has no hover.
        "&:hover .drag-handle, &:hover .beat-menu": { opacity: 1 },
        "@media (hover: hover)": { "& .beat-menu": { opacity: 0 } },
        // An unnamed beat keeps its label slot but says nothing in it until the
        // card is under the pointer or the field has focus. Most beats never get
        // a label, and a grid of cards each reading "BEAT LABEL" would be worse
        // than the thing it is advertising. An empty description does the same.
        "& .beat-label input::placeholder, & .beat-description textarea::placeholder": {
          opacity: 0,
          transition: "opacity 120ms ease",
        },
        "&:hover .beat-label input::placeholder, & .beat-label input:focus::placeholder, &:hover .beat-description textarea::placeholder, & .beat-description textarea:focus::placeholder":
          { opacity: 0.5 },
        bgcolor: "background.paper",
        "&:hover": { borderColor: (t) => t.loom.brassLine },
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
          {/*
            The menu shares the label's line, in the card's top-right corner —
            the mirror of the drag handle at top-left.
          */}
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <Box
              className="beat-label"
              sx={{ typography: "overline", color: "text.secondary", lineHeight: 1.6, flex: 1, minWidth: 0 }}
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
            <BeatMenu item={item} />
          </Stack>
          {/*
            A title is required, so a blank one is never saved: the field puts
            the stored title back on blur, and `save` skips a blank value in case
            the debounce fires first.
          */}
          <Box component="h3" sx={{ typography: "h6", fontSize: "1.15rem", minWidth: 0, m: 0 }}>
            <InlineTextField
              value={item.title}
              required
              placeholder="Untitled beat"
              ariaLabel={`Title of ${item.title}`}
              save={(title) =>
                title.trim() ? store.setPlotItemTitle(item.id, title) : Promise.resolve()
              }
              onSaveState={onSaveState}
            />
          </Box>
          <Box className="beat-description" sx={{ color: "text.secondary", mt: 0.5, lineHeight: 1.5 }}>
            <InlineTextField
              value={item.description}
              multiline
              placeholder="Add a description"
              ariaLabel={`Description of ${item.title}`}
              save={(description) => store.setPlotItemDescription(item.id, description)}
              onSaveState={onSaveState}
              sx={{ lineHeight: 1.5 }}
            />
          </Box>
          {/* The ✕ detaches; the chip body still opens the element. */}
          {attachments.length ? (
            <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
              {attachments.map((element) => {
                const type = types.find((t) => t.id === element.elementTypeId);
                return (
                  <Chip
                    key={element.id}
                    size="small"
                    icon={<ElementTypeIcon icon={type?.icon} fontSize="small" />}
                    label={element.name}
                    onClick={() => onOpenElement(element)}
                    onDelete={() =>
                      void store.setPlotItemAttachments(
                        item.id,
                        attachments.filter((other) => other.id !== element.id).map((other) => other.id),
                      )
                    }
                    deleteIcon={<CancelIcon aria-label={`Detach ${element.name}`} />}
                  />
                );
              })}
            </Stack>
          ) : null}
          {/* Wraps rather than squeezing the count when a column is narrow. */}
          <Stack direction="row" useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
            <Typography variant="overline" color="text.secondary" sx={{ flex: "1 1 auto", lineHeight: 1.6 }}>
              {item.writeItemIds.length
                ? `${plural(words, "word")} · ${plural(item.writeItemIds.length, "text")}`
                : "No text yet"}
            </Typography>
            {/*
              One pair: if the foot is too narrow, both drop below the count
              together; only a column narrower than the pair itself (two plots
              on a phone) stacks Attach over Write.
            */}
            <Stack
              direction="row"
              useFlexGap
              sx={{ ml: "auto", gap: 0.75, flexWrap: "wrap", justifyContent: "flex-end" }}
            >
              <AttachButton item={item} attachments={attachments} elements={elements} types={types} />
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditNoteIcon fontSize="small" />}
                aria-label={`Write ${item.title}`}
                onClick={() => onWrite(item)}
                sx={footButtonSx}
              >
                Write
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Stack>
    </Card>
  );
}

/**
 * The card's own actions. Only Delete lives here: everything else about a beat
 * is edited where it is drawn, so the card stopped opening a dialog.
 *
 * A plain button, for the drag handle's reason — it sits inside a draggable
 * cell. It sits in the card's top-right corner, opposite the handle, and like
 * the handle is revealed on hover where there is hover and always shown where
 * there is not; `:focus-visible` shows it to the keyboard.
 */
function BeatMenu({ item }: { item: PlotItem }) {
  const confirmAction = useConfirm();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Box
        component="button"
        type="button"
        className="beat-menu"
        title="More actions"
        aria-label={`More actions for ${item.title}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(event: React.MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)}
        sx={{
          // Pulled into the corner the way the drag handle is pulled left.
          mt: -0.25,
          mr: -0.5,
          p: 0.5,
          display: "inline-flex",
          border: 0,
          borderRadius: "50%",
          bgcolor: "transparent",
          color: "text.secondary",
          cursor: "pointer",
          transition: "opacity 120ms ease",
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": { opacity: 1 },
        }}
      >
        <MoreVertIcon fontSize="small" />
      </Box>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem
          sx={{ color: "error.main" }}
          onClick={() => {
            setAnchor(null);
            confirmAction(`Delete "${item.title}" from this plot?`, () => store.deletePlotItem(item));
          }}
        >
          <ListItemIcon sx={{ color: "inherit" }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          Delete beat
        </MenuItem>
      </Menu>
    </>
  );
}

/**
 * Attach, beside Write in the card's foot: the two things a beat is *given* —
 * its cast and its prose. Always visible, since touch has no hover. Each pick
 * saves at once — there is nothing to confirm about an association. The chips
 * it produces still sit under the description.
 */
function AttachButton({
  item,
  attachments,
  elements,
  types,
}: {
  item: PlotItem;
  attachments: Element[];
  elements: Element[];
  types: ElementType[];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<AddIcon fontSize="small" />}
        aria-label={`Attach elements to ${item.title}`}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={footButtonSx}
      >
        Attach
      </Button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { sx: { p: 2, width: 340, maxWidth: "calc(100vw - 32px)" } },
          // Focus the search box once the popover has settled. `autoFocus` on
          // the field loses: the Popover's focus trap and the button that was
          // clicked both take focus back after the field mounts, and an
          // Autocomplete without focus ignores clicks on its options.
          transition: {
            onEntered: (node: HTMLElement) => node.querySelector("input")?.focus(),
          },
        }}
      >
        <ElementAttachPicker
          elements={elements}
          types={types}
          value={attachments}
          onChange={(value) =>
            void store.setPlotItemAttachments(
              item.id,
              value.map((element) => element.id),
            )
          }
          label="Attached elements"
          autoFocus
        />
      </Popover>
    </>
  );
}
