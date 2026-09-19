import { Box, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { brandFontFamily } from "../theme";

/**
 * One figure with its label, and optionally a bar under it — the tile the
 * activity pages, the dashboard card and the library page all count in.
 *
 * It exists so those three surfaces cannot drift: the same figure has to read
 * the same way whether it is the headline of a page or the third line of a card
 * on the overview. The number is set in the brand serif, which is what makes a
 * count read as a quantity rather than as another piece of interface.
 *
 * `fraction` is clamped by the caller's data, not here: a bar past 100% would
 * be a bug in the figure above it, and hiding it would hide the bug.
 */
export function ActivityStat({
  label,
  value,
  unit,
  note,
  fraction,
  tone = "primary",
  dense,
}: {
  label: string;
  value: string;
  /** The quieter half of the figure — "/ 1,000", "days", "%". */
  unit?: string;
  note?: React.ReactNode;
  /** `0`–`1`. Draws a bar; omit for a figure with nothing to be a fraction of. */
  fraction?: number;
  tone?: "primary" | "secondary" | "error";
  dense?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: dense ? 1.5 : 2, height: "100%", display: "flex", flexDirection: "column" }}
    >
      <Typography
        variant="overline"
        sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.1em", lineHeight: 1.6 }}
      >
        {label}
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline", mt: 0.25 }}>
        <Typography
          sx={{
            fontFamily: brandFontFamily,
            fontSize: dense ? "1.6rem" : "2.1rem",
            lineHeight: 1.1,
            color: tone === "primary" ? "text.primary" : `${tone}.main`,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Typography>
        {unit ? (
          <Typography sx={{ color: "text.secondary", fontSize: "0.85rem", fontWeight: 600 }}>
            {unit}
          </Typography>
        ) : null}
      </Stack>
      {fraction === undefined ? null : (
        <LinearProgress
          variant="determinate"
          value={Math.min(100, Math.max(0, fraction * 100))}
          color={tone === "primary" ? "primary" : tone}
          sx={{ mt: 1.25, height: 7, borderRadius: 99 }}
        />
      )}
      {note ? (
        <Box sx={{ mt: 1, color: "text.secondary", fontSize: "0.8rem", lineHeight: 1.5 }}>
          {note}
        </Box>
      ) : null}
    </Paper>
  );
}
