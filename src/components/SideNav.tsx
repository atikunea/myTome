import { NavLink } from "react-router-dom";
import { Box, ListItemButton, ListItemText, Typography } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { brandFontFamily } from "../theme";
import { ElementTypeIcon } from "./ElementTypeIcon";

const navItemSx = {
  color: "#dfd7d1",
  borderRadius: "7px",
  px: 1.1,
  py: 1,
  flex: "0 0 auto",
  "&:hover": { bgcolor: "#44372f", color: "#fff" },
  "&.active": { bgcolor: "#44372f", color: "#fff" },
};

export function SideNav() {
  const { tome, types } = useTomeWorkspace();
  if (!tome) return null;

  return (
    <Box
      component="aside"
      sx={{
        bgcolor: "#27201c",
        color: "#eee",
        display: "flex",
        flexDirection: { xs: "row", sm: "column" },
        alignItems: { xs: "center", sm: "stretch" },
        overflow: { xs: "auto", sm: "visible" },
        whiteSpace: { xs: "nowrap", sm: "normal" },
        py: { xs: 1.75, sm: 4 },
        px: { xs: 1.75, sm: 2.5 },
        gap: 0.5,
      }}
    >
      <Typography
        component={NavLink}
        to="/tomes"
        sx={{
          fontFamily: brandFontFamily,
          fontSize: { xs: "1.25rem", sm: "1.7rem" },
          color: "#fff",
          textDecoration: "none",
          mb: { xs: 0, sm: 4.5 },
          mr: { xs: 1.5, sm: 0 },
          flex: "0 0 auto",
        }}
      >
        myTome
      </Typography>
      <NavLabel>{tome.title}</NavLabel>
      <ListItemButton
        component={NavLink}
        to={`/tomes/${tome.id}/dashboard`}
        sx={navItemSx}
      >
        <ListItemText primary="Overview" />
      </ListItemButton>
      <NavLabel>ELEMENTS</NavLabel>
      {types.map((type) => (
        <ListItemButton
          key={type.id}
          component={NavLink}
          to={`/tomes/${tome.id}/elements/${type.id}`}
          sx={navItemSx}
        >
          <ElementTypeIcon icon={type.icon} fontSize="small" sx={{ mr: 1 }} />
          <ListItemText primary={type.name} />
        </ListItemButton>
      ))}
      <ListItemButton
        component={NavLink}
        to={`/tomes/${tome.id}/elements/settings`}
        sx={navItemSx}
      >
        <SettingsIcon fontSize="small" sx={{ mr: 1 }} />
        <ListItemText primary="Manage Elements" />
      </ListItemButton>
    </Box>
  );
}

function NavLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        display: { xs: "none", sm: "block" },
        m: "18px 9px 5px",
        color: "#bfa998",
        fontSize: "0.72rem",
        fontWeight: 800,
        letterSpacing: "0.12em",
      }}
    >
      {children}
    </Typography>
  );
}
