import { Popover } from "@mui/material";
import type { PlotItem } from "../models/Plot";
import { store } from "../services/store";
import { DotStyleControls } from "./DotStyleControls";

/**
 * The dot's own editor, opened from the dot on the track. Each choice saves as
 * it is made, through `setPlotItemDot`, which writes only the key it is given —
 * so the controls read the live `item`, never a local copy.
 *
 * Which beat's popover is open is not a route: it is which field is being
 * edited, and that stays out of the URL.
 */
export function BeatDotPopover({
  item,
  thread,
  anchor,
  onClose,
}: {
  item: PlotItem;
  thread: string;
  anchor: HTMLElement | null;
  onClose: () => void;
}) {
  return (
    <Popover
      open={Boolean(anchor)}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "center", horizontal: "right" }}
      transformOrigin={{ vertical: "center", horizontal: "left" }}
      slotProps={{ paper: { sx: { p: 2, width: 300, maxWidth: "calc(100vw - 32px)" } } }}
    >
      <DotStyleControls
        dotColor={item.dotColor ?? "grey"}
        dotVariant={item.dotVariant ?? "filled"}
        icon={item.icon ?? ""}
        thread={thread}
        onChange={(patch) =>
          void store.setPlotItemDot(
            item.id,
            "icon" in patch ? { ...patch, icon: patch.icon || undefined } : patch,
          )
        }
      />
    </Popover>
  );
}
