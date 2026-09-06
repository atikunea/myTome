import type { ReactNode } from "react";
import { Box, Grid, Stack, Typography } from "@mui/material";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import ViewWeekIcon from "@mui/icons-material/ViewWeek";

/**
 * Three things an author with a shelf full of tomes may still not know myTome
 * does, sitting under the shelf as a quiet band.
 *
 * Deliberately **not** the five steps of `LibraryGuide` in miniature: someone
 * who has tomes has already made one, so a walkthrough is the wrong shape.
 * These are the three features authors get furthest without discovering — the
 * side-by-side compare, the backup file, and the manuscript export — and being
 * unordered, they carry no numbers.
 */

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <ViewWeekIcon fontSize="small" />,
    title: "Compare two threads",
    body: "Line plots up on one timeline and see what your villain is doing while your hero sleeps.",
  },
  {
    icon: <CloudDoneIcon fontSize="small" />,
    title: "Keep a backup",
    body: "Your writing is in this browser only. One click makes a copy you own.",
  },
  {
    icon: <PictureAsPdfOutlinedIcon fontSize="small" />,
    title: "Print the book",
    body: "A finished thread becomes a Word file or a PDF, typeset the way you wrote it.",
  },
];

export function FeatureHighlights() {
  return (
    <Grid container spacing={{ xs: 2.5, sm: 4 }}>
      {FEATURES.map((feature) => (
        <Grid key={feature.title} size={{ xs: 12, sm: 4 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Box sx={{ color: "primary.main", display: "flex", pt: 0.3 }}>{feature.icon}</Box>
            <Box>
              <Typography variant="h2" sx={{ fontSize: "1rem" }}>
                {feature.title}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.35, fontSize: "0.9rem" }}>
                {feature.body}
              </Typography>
            </Box>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}
