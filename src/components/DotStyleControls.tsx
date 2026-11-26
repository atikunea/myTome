import { Box, Stack, Typography } from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import type { PlotDotColor, PlotDotVariant } from "../models/Plot";
import { plotDotColors } from "../models/Plot";
import { elementTypeIconOptions } from "./ElementTypeIcon";
import { dotColor as dotColorOf } from "../theme";

/**
 * What each swatch is called. Hue names, not the stored palette-role names:
 * "Warning" and "Danger" promised a meaning a dot never carried. The stored
 * values are unchanged — see `loom.dots` in `theme.ts`.
 */
export const dotColorLabels: Record<PlotDotColor, string> = {
  grey: "Thread",
  primary: "Yellow",
  warning: "Orange",
  error: "Red",
  secondary: "Violet",
  info: "Blue",
  success: "Green",
};

export type DotStylePatch = {
  dotColor?: PlotDotColor;
  dotVariant?: PlotDotVariant;
  /** `""` is "no icon"; the caller decides how that is stored. */
  icon?: string;
};

/**
 * How a beat's dot is drawn: its colour, filled or outlined, and its icon.
 * Shared by the dot popover on the grid and the create dialog, so the two
 * cannot disagree about what a choice looks like.
 *
 * **`grey` is drawn in the plot's thread colour and called "Thread"**, because
 * that is what `BeatDot` draws for it. A grey swatch here would promise a grey
 * dot the grid never shows.
 *
 * Every control is a plain button (not `ButtonBase`): the popover is opened
 * from inside a draggable grid cell, and the swatches are tiny targets anyway.
 */
export function DotStyleControls({
  dotColor,
  dotVariant,
  icon,
  thread,
  onChange,
}: {
  dotColor: PlotDotColor;
  dotVariant: PlotDotVariant;
  icon: string;
  /** The plot's thread colour — what "Thread" is drawn in. */
  thread: string;
  onChange: (patch: DotStylePatch) => void;
}) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Colour
        </Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          {plotDotColors.map((color) => (
            <Box
              key={color}
              component="button"
              type="button"
              title={dotColorLabels[color]}
              aria-label={dotColorLabels[color]}
              aria-pressed={dotColor === color}
              onClick={() => onChange({ dotColor: color })}
              sx={{
                width: 30,
                height: 30,
                p: 0,
                borderRadius: "50%",
                cursor: "pointer",
                bgcolor: (theme) => dotColorOf(theme, color, thread),
                border: 3,
                borderColor: dotColor === color ? "text.primary" : "transparent",
                outlineOffset: 2,
              }}
            />
          ))}
        </Stack>
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Style
        </Typography>
        <Stack direction="row" spacing={1}>
          {(["filled", "outlined"] as const).map((variant) => (
            <Box
              key={variant}
              component="button"
              type="button"
              aria-pressed={dotVariant === variant}
              onClick={() => onChange({ dotVariant: variant })}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 0.75,
                borderRadius: 1,
                cursor: "pointer",
                font: "inherit",
                color: "text.primary",
                bgcolor: dotVariant === variant ? "action.selected" : "transparent",
                border: 1,
                borderColor: dotVariant === variant ? "text.primary" : "divider",
              }}
            >
              <Box
                aria-hidden
                sx={(theme) => {
                  const color = dotColorOf(theme, dotColor, thread);
                  return {
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    boxSizing: "border-box",
                    border: variant === "outlined" ? 2 : 0,
                    borderColor: color,
                    bgcolor: variant === "filled" ? color : "transparent",
                  };
                }}
              />
              {variant === "filled" ? "Filled" : "Outlined"}
            </Box>
          ))}
        </Stack>
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Icon
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 36px)", gap: 0.5 }}>
          {[{ key: "", label: "No icon", Icon: BlockIcon }, ...elementTypeIconOptions].map(
            (option) => (
              <Box
                key={option.key || "none"}
                component="button"
                type="button"
                title={option.label}
                aria-label={option.label}
                aria-pressed={icon === option.key}
                onClick={() => onChange({ icon: option.key })}
                sx={{
                  width: 36,
                  height: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 1,
                  cursor: "pointer",
                  color: icon === option.key ? "text.primary" : "text.secondary",
                  bgcolor: icon === option.key ? "action.selected" : "transparent",
                  border: 1,
                  borderColor: icon === option.key ? "text.primary" : "transparent",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <option.Icon fontSize="small" />
              </Box>
            ),
          )}
        </Box>
      </Box>
    </Stack>
  );
}
