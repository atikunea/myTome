import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";

export function AppHeader() {
  const { tome } = useTomeWorkspace();
  if (!tome) return null;

  return (
    <Box
      component="header"
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "flex-start", sm: "center" },
        justifyContent: "space-between",
        gap: 2,
        pb: 3,
        mb: 5,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Box>
        <Button
          component={RouterLink}
          to="/tomes"
          size="small"
          startIcon={<ArrowBackIcon fontSize="small" />}
          sx={{ color: "text.secondary", fontWeight: 500, px: 0 }}
        >
          Library
        </Button>
        <Typography variant="h1" sx={{ fontSize: { xs: "1rem", sm: "2rem" }, mt: 1 }}>
          {tome.title}
        </Typography>
      </Box>
      <Button component={RouterLink} to={`/tomes/${tome.id}/edit`}>
        Edit tome
      </Button>
    </Box>
  );
}
