import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Grid, Paper, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CategoryIcon from "@mui/icons-material/Category";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import EditNoteIcon from "@mui/icons-material/EditNote";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import TimelineIcon from "@mui/icons-material/Timeline";
import { brandFontFamily } from "../theme";
import { SpineDiagram } from "./SpineDiagram";

/**
 * What myTome is, for someone who has not used it — the whole of the library
 * page when the shelf is empty, and the whole of `/tomes/guide` afterwards.
 *
 * Two rules it is written to:
 *
 * - **It is a sequence, so it is numbered.** The five steps are the order the
 *   app actually wants: a tome exists before its elements, elements before the
 *   beats that attach them, beats before the prose that sits on them. That is
 *   why this is a numbered list and `FeatureHighlights` — three unordered
 *   capabilities — is not.
 * - **It says what an author gets, never what the code holds.** No "element
 *   type", no "plot row", no "spine": a reader who has not opened a tome has no
 *   referent for any of them. The vocabulary is taught by the app itself, in
 *   place, and the diagram teaches the row axis by drawing it.
 *
 * It reads no table. The library page passes `firstTome` because the button
 * under an empty shelf and the button on the guide route are the same control
 * saying two honest things.
 */

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <MenuBookIcon fontSize="small" />,
    title: "Make a tome",
    body: "Give the book a title and a cover. Everything else lives inside it.",
  },
  {
    icon: <CategoryIcon fontSize="small" />,
    title: "Say what your world is made of",
    body: "Characters, places, factions, ships — you choose the kinds of note and the fields each one carries, then fill them in and link them to each other.",
  },
  {
    icon: <TimelineIcon fontSize="small" />,
    title: "Lay out a thread",
    body: "Break the story into beats. Add a second thread and line the two up on one timeline to see what happens at the same moment in each.",
  },
  {
    icon: <EditNoteIcon fontSize="small" />,
    title: "Write the scene on its beat",
    body: "Draft in a clean editor, @-mention a character to link them in, and the scene stays attached to the beat it belongs to.",
  },
  {
    icon: <CloudDoneIcon fontSize="small" />,
    title: "Back it up, then print it",
    body: "Your writing lives in this browser and nowhere else, so download a backup file — or sync through your own Google Drive. When a thread is done, save it as a Word file or print it to PDF.",
  },
];

export function LibraryGuide({ firstTome = false }: { firstTome?: boolean }) {
  return (
    <Box>
      <Typography
        variant="h1"
        sx={{
          fontFamily: brandFontFamily,
          fontWeight: 400,
          fontSize: { xs: "2.15rem", sm: "3.1rem" },
          letterSpacing: "-0.03em",
          lineHeight: 1.06,
          maxWidth: "18ch",
        }}
      >
        Write the story only you can tell.
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1.75, maxWidth: "56ch", fontSize: "1.02rem" }}>
        A tome holds one book: its cast and world, its plot threads, and every scene you write.
        Five steps and you will have written one.
      </Typography>

      <Grid container spacing={{ xs: 4, md: 6 }} sx={{ mt: { xs: 2, sm: 3.5 } }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2.75}>
            {STEPS.map((step, index) => (
              <Stack key={step.title} direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
                {/*
                  The numeral is the marker, not an icon in a tile: at this size
                  a badged icon reads as noise, and the number is the part
                  carrying meaning — these steps are an order, not a menu.
                */}
                <Typography
                  aria-hidden
                  sx={{
                    flex: "0 0 auto",
                    width: 24,
                    fontFamily: brandFontFamily,
                    fontSize: "1.5rem",
                    lineHeight: 1,
                    color: "primary.main",
                    pt: 0.15,
                  }}
                >
                  {index + 1}
                </Typography>
                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Box sx={{ color: "primary.main", display: "flex" }}>{step.icon}</Box>
                    <Typography variant="h2" sx={{ fontSize: "1.05rem" }}>
                      {step.title}
                    </Typography>
                  </Stack>
                  <Typography color="text.secondary" sx={{ mt: 0.4, fontSize: "0.92rem" }}>
                    {step.body}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2.25}>
            <SpineDiagram caption="Beats on one row are happening at once. A blank cell means that thread is quiet — the shape of the story, at a glance." />
            <Paper variant="outlined" sx={{ p: 2.25, borderRadius: "14px" }}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ fontWeight: 800, letterSpacing: "0.12em" }}
              >
                BEFORE YOU START
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.75, fontSize: "0.92rem" }}>
                There is no account and nothing is uploaded. Your writing is saved in this browser,
                so clearing site data would erase it. Backups are one click, and they are yours.
              </Typography>
            </Paper>
            <Button
              component={RouterLink}
              to="/tomes/new"
              startIcon={<AddIcon />}
              size="large"
              sx={{ alignSelf: "flex-start" }}
            >
              {firstTome ? "Make your first tome" : "New tome"}
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
