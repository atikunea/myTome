import { Navigate, Outlet, useParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { TomeWorkspaceProvider, useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { SideNav } from "../components/SideNav";
import { AppHeader } from "../components/AppHeader";

export function WorkspaceLayout() {
  const { tomeId } = useParams<{ tomeId: string }>();
  if (!tomeId) return <Navigate to="/tomes" replace />;

  return (
    <TomeWorkspaceProvider tomeId={tomeId}>
      <WorkspaceLayoutInner />
    </TomeWorkspaceProvider>
  );
}

function WorkspaceLayoutInner() {
  const { tome } = useTomeWorkspace();

  if (!tome)
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <Typography color="text.secondary">Loading tome…</Typography>
      </Box>
    );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "238px 1fr" },
        minHeight: "100vh",
      }}
    >
      <SideNav />
      <Box
        component="main"
        sx={{
          minWidth: 0,
          bgcolor: "background.default",
          p: { xs: "27px 18px", sm: "48px clamp(20px, 5vw, 76px)" },
        }}
      >
        {/* <AppHeader /> */}
        <Outlet />
      </Box>
    </Box>
  );
}
