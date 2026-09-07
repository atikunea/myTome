import { Box } from "@mui/material";
import type { PlotDotColor, PlotItem } from "../models/Plot";
import { ElementTypeIcon } from "./ElementTypeIcon";

/** `PlotDotColor` as a theme token — "grey" is not a palette entry with a `.main`. */
const dotToken = (color: PlotDotColor) => (color === "grey" ? "grey.500" : `${color}.main`);

/**
 * The beat's marker on the track: its colour, its variant, and its icon if it
 * has one. This is a hand-rolled stand-in for MUI's `TimelineDot`, which cannot
 * be used outside a `Timeline` — it reads the position out of Timeline's own
 * context and ships an `align-self` that only makes sense inside a
 * `TimelineSeparator`.
 *
 * It sizes itself to `ICON_DOT_SIZE` in `PlotGrid` when it carries an icon, so
 * the track column can be a fixed width whether or not a beat has one.
 */
export function BeatDot({ item }: { item: PlotItem }) {
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
