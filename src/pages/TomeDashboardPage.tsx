import { Box, Paper, Typography } from "@mui/material";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { TomeFormDialog } from "../components/TomeFormDialog";

export function TomeDashboardPage({ editing = false }: { editing?: boolean }) {
  const { tome } = useTomeWorkspace();
  if (!tome) return null;

  return (
    <Box sx={{ maxWidth: 680 }}>
      <Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: "0.12em" }}>
        TOME OVERVIEW
      </Typography>
      <Typography variant="h2" sx={{ fontSize: "1.7rem", my: 1.25 }}>
        {tome.subtitle || "A home for your story"}
      </Typography>
      <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
        {tome.description || "Add a description to give this tome its north star."}
      </Typography>
      <Paper variant="outlined" sx={{ mt: 3.5, p: 2.25, bgcolor: "warning.light", border: 0, lineHeight: 1.45 }}>
        Use the Elements navigation to define the people, places, ideas, and events in this world.
      </Paper>
      <TomeFormDialog open={editing} tome={tome} />
    </Box>
  );
}
