import { NavLink } from "react-router-dom";
import {
  Box,
  IconButton,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
  useTheme,
  type Theme,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EditNoteIcon from "@mui/icons-material/EditNote";
import InsightsIcon from "@mui/icons-material/Insights";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import type { Plot } from "../models/Plot";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useObservable } from "../hooks/useObservable";
import { threadColor } from "../theme";
import { ElementTypeIcon } from "./ElementTypeIcon";

/** Height of the xs top bar, in px. Fixed so it never grows with the page. */
const NAV_BAR_HEIGHT = 56;

/**
 * A nav item is a pill. The current one is washed in brass and ringed with it:
 * the one place in the nav that says "you are here".
 */
const navItemSx = {
  color: "text.secondary",
  borderRadius: 999,
  px: 1.5,
  py: { xs: 0.5, sm: 0.75 },
  flex: "0 0 auto",
  "& .MuiListItemText-primary": { fontWeight: 500, fontSize: "0.9rem" },
  "&:hover": { bgcolor: "action.hover", color: "text.primary" },
  "&.active": {
    bgcolor: (t: Theme) => t.loom.brassSoft,
    color: "primary.main",
    boxShadow: (t: Theme) => `inset 0 0 0 1px ${t.loom.brassLine}`,
  },
} as const;

/** The disc a plot is listed with: its thread colour, so the nav names it the way the grid draws it. */
function Knot({ color }: { color: string }) {
  return (
    <Box
      aria-hidden
      sx={(t) => ({
        width: 9,
        height: 9,
        mr: 1.25,
        ml: 0.5,
        flexShrink: 0,
        borderRadius: "50%",
        bgcolor: color,
        boxShadow: `0 0 ${t.loom.halo / 2}px ${color}`,
      })}
    />
  );
}

/**
 * `hidden` removes the nav from `sm` up only — below that it is the top bar,
 * and the only way around the tome on a phone. The layout owns the flag
 * because it also decides the grid's columns.
 */
export function SideNav({ hidden, onHide }: { hidden: boolean; onHide: () => void }) {
  const theme = useTheme();
  const { tome, types } = useTomeWorkspace();
  const plots =
    useObservable<Plot[]>((cb) => store.observePlots(tome?.id ?? "", cb), [tome?.id]) ?? [];
  if (!tome) return null;

  return (
    <Box
      component="aside"
      sx={{
        // The nav follows the colour mode: a step darker than the page in dark,
        // a step tinted from it in light.
        bgcolor: (t) => t.loom.nav,
        color: "text.primary",
        borderRight: { xs: 0, sm: 1 },
        borderBottom: { xs: 1, sm: 0 },
        borderColor: "divider",
        display: { xs: "flex", sm: hidden ? "none" : "flex" },
        position: "relative",
        flexDirection: { xs: "row", sm: "column" },
        alignItems: { xs: "center", sm: "stretch" },
        // Below sm this is a top bar, and its height must not move: fixed, and
        // scrolling only sideways. A thin scrollbar keeps a tome with many
        // plots the same height as one with none.
        height: { xs: NAV_BAR_HEIGHT, sm: "auto" },
        boxSizing: "border-box",
        overflowX: { xs: "auto", sm: "visible" },
        overflowY: { xs: "hidden", sm: "visible" },
        scrollbarWidth: "thin",
        "&::-webkit-scrollbar": { height: 6 },
        "&::-webkit-scrollbar-thumb": { bgcolor: "divider", borderRadius: 3 },
        whiteSpace: { xs: "nowrap", sm: "normal" },
        py: { xs: 0, sm: 3.5 },
        px: { xs: 1.75, sm: 2 },
        gap: 0.5,
      }}
    >
      <Typography
        component={NavLink}
        to="/tomes"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          fontSize: { xs: "1.2rem", sm: "1.45rem" },
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "text.primary",
          textDecoration: "none",
          mb: { xs: 0, sm: 3 },
          mr: { xs: 1.5, sm: 0 },
          px: { sm: 1 },
          flex: "0 0 auto",
        }}
      >
        <Box
          aria-hidden
          sx={(t) => ({
            width: 12,
            height: 12,
            borderRadius: "50%",
            bgcolor: t.loom.brass,
            boxShadow: `0 0 ${t.loom.halo}px ${t.loom.brass}`,
          })}
        />
        mytome
      </Typography>
      <Tooltip title="Hide menu">
        <IconButton
          aria-label="Hide menu"
          onClick={onHide}
          size="small"
          sx={{
            display: { xs: "none", sm: "inline-flex" },
            position: "absolute",
            top: 30,
            right: 12,
            color: "text.secondary",
            "&:hover": { color: "primary.main" },
          }}
        >
          <MenuOpenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Box
        sx={{
          display: { xs: "none", sm: "block" },
          mx: 0.5,
          mb: 1.5,
          p: 1.75,
          borderRadius: 4,
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          boxShadow: (t) => t.loom.lift,
        }}
      >
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: "block", lineHeight: 1.6 }}
        >
          Tome
        </Typography>
        <Typography
          sx={{ fontWeight: 600, fontSize: "1.05rem", lineHeight: 1.25, overflowWrap: "anywhere" }}
        >
          {tome.title}
        </Typography>
      </Box>
      <ListItemButton
        component={NavLink}
        to={`/tomes/${tome.id}/dashboard`}
        sx={navItemSx}
      >
        <DashboardOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
        <ListItemText primary="Overview" />
      </ListItemButton>
      <NavLabel>Plots</NavLabel>
      {plots.length ? (
        plots.map((plot, index) => (
          <ListItemButton
            key={plot.id}
            component={NavLink}
            to={`/tomes/${tome.id}/plots/${plot.id}`}
            sx={navItemSx}
          >
            <Knot color={threadColor(theme, index)} />
            <ListItemText primary={plot.name} />
          </ListItemButton>
        ))
      ) : (
        <ListItemButton component={NavLink} to={`/tomes/${tome.id}/plots`} sx={navItemSx}>
          <Knot color={threadColor(theme, 0)} />
          <ListItemText primary="Main Plot" />
        </ListItemButton>
      )}
      <NavLabel>Write</NavLabel>
      <ListItemButton
        component={NavLink}
        to={`/tomes/${tome.id}/write`}
        sx={navItemSx}
      >
        <EditNoteIcon fontSize="small" sx={{ mr: 1 }} />
        <ListItemText primary="Write" />
      </ListItemButton>
      {/* Beside Write rather than under the book's own heading: it is about
          the writing, and it is where an author goes straight after a session. */}
      <ListItemButton
        component={NavLink}
        to={`/tomes/${tome.id}/activity`}
        sx={navItemSx}
      >
        <InsightsIcon fontSize="small" sx={{ mr: 1 }} />
        <ListItemText primary="Activity" />
      </ListItemButton>
      {/*
        Editing the element types is a setting *of* this list, so it sits on
        the list's own heading rather than as one more item in it. The heading
        is hidden in the xs top bar; the gear is not, or a phone would lose the
        only way in.
      */}
      <Box sx={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
        <NavLabel>Elements</NavLabel>
        <Box sx={{ flex: 1, display: { xs: "none", sm: "block" } }} />
        <Tooltip title="Edit element types">
          <IconButton
            component={NavLink}
            to={`/tomes/${tome.id}/elements/settings`}
            aria-label="Edit element types"
            size="small"
            sx={{
              mt: { sm: "13px" },
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
              "&.active": { color: "primary.main", bgcolor: (t) => t.loom.brassSoft },
            }}
          >
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
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
    </Box>
  );
}

function NavLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{
        display: { xs: "none", sm: "block" },
        m: "18px 12px 5px",
        lineHeight: 1.6,
        color: "text.secondary",
      }}
    >
      {children}
    </Typography>
  );
}
