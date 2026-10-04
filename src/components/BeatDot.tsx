import { Box } from "@mui/material";
import type { PlotDotColor, PlotItem } from "../models/Plot";
import { ElementTypeIcon } from "./ElementTypeIcon";

/**
 * The beat's knot on its thread: its colour, its variant, and its icon if it
 * has one. This is a hand-rolled stand-in for MUI's `TimelineDot`, which cannot
 * be used outside a `Timeline` — it reads the position out of Timeline's own
 * context and ships an `align-self` that only makes sense inside a
 * `TimelineSeparator`.
 *
 * **"grey" means "the thread's own colour".** It is every beat's default, and a
 * grey knot on a brass thread reads as a beat that failed to load; a knot that
 * matches its thread reads as tied to it. A beat the author coloured keeps its
 * colour, which is then the one thing on the column that stands out.
 *
 * It sizes itself to `ICON_DOT_SIZE` in `PlotGrid` when it carries an icon, so
 * the track column can be a fixed width whether or not a beat has one.
 */
export function BeatDot({ item, thread }: { item: PlotItem; thread: string }) {
  const filled = (item.dotVariant ?? "filled") === "filled";
  return (
    <Box
      aria-hidden
      sx={(theme) => {
        const color =
          item.dotColor && item.dotColor !== "grey"
            ? theme.palette[item.dotColor as Exclude<PlotDotColor, "grey">].main
            : thread;
        const ground = theme.palette.background.default;
        return {
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          width: item.icon ? 28 : 12,
          height: item.icon ? 28 : 12,
          boxSizing: "border-box",
          border: filled ? 0 : 2,
          borderColor: color,
          bgcolor: filled ? color : ground,
          color: filled ? ground : color,
          // A ring of the ground around the knot, so the thread reads as
          // passing *behind* it — and in dark mode, a glow of its own colour.
          boxShadow: `0 0 0 3px ${ground}, 0 0 ${theme.loom.halo}px ${color}`,
        };
      }}
    >
      {item.icon ? <ElementTypeIcon icon={item.icon} fontSize="small" /> : null}
    </Box>
  );
}
