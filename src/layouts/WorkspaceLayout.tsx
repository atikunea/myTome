import { useState } from "react";
import { Navigate, Outlet, useParams } from "react-router-dom";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { TomeWorkspaceProvider, useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { SideNav } from "../components/SideNav";

/**
 * Whether the side menu is hidden is a preference of this browser, like the
 * colour mode, so it lives in `localStorage` rather than in Dexie — and the
 * privacy page's storage list names it.
 *
 * It applies from `sm` up only. Below that the nav is a 56px top bar, already
 * out of the way, and the only route around the tome on a phone.
 */
const NAV_HIDDEN_KEY = "mytome:side-nav-hidden";

function initiallyHidden() {
  try {
    return localStorage.getItem(NAV_HIDDEN_KEY) === "true";
  } catch {
    return false;
  }
}

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
  const [navHidden, setNavHidden] = useState(initiallyHidden);

  const setHidden = (hidden: boolean) => {
    setNavHidden(hidden);
    try {
      localStorage.setItem(NAV_HIDDEN_KEY, String(hidden));
    } catch {
      // Hidden for this visit is better than not hidden at all.
    }
  };

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
        gridTemplateColumns: { xs: "1fr", sm: navHidden ? "1fr" : "238px 1fr" },
        // Auto rows stretch to fill the 100vh grid, which let the xs top bar
        // absorb whatever height the page didn't use. Pin the bar to its
        // content and give the leftover to main.
        gridTemplateRows: { xs: "auto 1fr", sm: "1fr" },
        minHeight: "100vh",
      }}
    >
      <SideNav hidden={navHidden} onHide={() => setHidden(true)} />
      {navHidden && (
        // Mirrors `ColorModeToggle` in the opposite corner, and sits below the
        // modal layer so the focus surface still covers it.
        <Tooltip title="Show menu">
          <IconButton
            aria-label="Show menu"
            onClick={() => setHidden(false)}
            size="small"
            sx={{
              display: { xs: "none", sm: "inline-flex" },
              position: "fixed",
              top: 12,
              left: 12,
              zIndex: (theme) => theme.zIndex.appBar,
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
              "&:hover": { bgcolor: "background.paper" },
            }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
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
