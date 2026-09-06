import { Box, Paper, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";

/**
 * A drawing of the spine, for the guide on the library page.
 *
 * The shared row axis is the one idea in myTome that no other writing app
 * spends a screen on, and it is the one that reads worst as a sentence: "beats
 * on the same row are contemporaneous" means nothing until you have seen a gap.
 * So the guide shows a three-plot grid with two cells missing and says what the
 * blanks mean, rather than asking an author to take it on trust.
 *
 * This is an illustration, not a view: the beats below are sample text and no
 * table is read. It stays in step with `PlotGrid` by hand, which is the right
 * trade for a picture that has to be legible at a third of the size.
 */

/** The columns of the drawing. Sample plots, not the author's. */
const PLOTS = ["The road", "The court", "The guild"];

/** One entry per spine row; `null` is a gap — that plot is quiet there. */
const ROWS: (string | null)[][] = [
  ["Caravan sets out", "Court hears nothing", null],
  [null, "The regent moves", "Salt price doubles"],
  ["Ambush at the ford", null, "Guild closes ranks"],
];

/**
 * Columns are told apart by hue rather than by label alone, following the
 * plot palette: primary, then the plum second voice, then plain ink.
 */
function columnColor(theme: Theme, column: number) {
  return [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.text.secondary,
  ][column % 3];
}

export function SpineDiagram({ caption }: { caption: string }) {
  return (
    <Paper variant="outlined" component="figure" sx={{ m: 0, p: 2, borderRadius: "14px" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.75 }}>
        {PLOTS.map((plot, column) => (
          <Typography
            key={plot}
            variant="caption"
            sx={(theme) => ({
              color: columnColor(theme, column),
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontSize: "0.62rem",
              mb: 0.25,
            })}
          >
            {plot}
          </Typography>
        ))}
        {ROWS.flatMap((row, rowIndex) =>
          row.map((beat, column) =>
            beat ? (
              <Box
                key={`${rowIndex}-${column}`}
                sx={(theme) => ({
                  borderRadius: "7px",
                  border: 1,
                  borderColor: alpha(columnColor(theme, column), 0.45),
                  bgcolor: alpha(columnColor(theme, column), 0.07),
                  px: 1,
                  py: 0.85,
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  lineHeight: 1.25,
                })}
              >
                {beat}
              </Box>
            ) : (
              <Box
                key={`${rowIndex}-${column}`}
                sx={{
                  borderRadius: "7px",
                  border: 1,
                  borderStyle: "dashed",
                  borderColor: "divider",
                  minHeight: 34,
                }}
              />
            ),
          ),
        )}
      </Box>
      <Typography
        component="figcaption"
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1.5, fontSize: "0.78rem" }}
      >
        {caption}
      </Typography>
    </Paper>
  );
}
