import { useState, type ReactNode } from "react";
import {
  Box,
  Dialog,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import CheckIcon from "@mui/icons-material/Check";
import { useProseFace } from "../context/ProseFaceContext";
import { proseMeasure } from "./manuscriptStyles";

/**
 * The writing surface: an overlay above the workspace, with the app dimmed
 * behind it.
 *
 * The scrim is the point. The route stays under `WorkspaceLayout`, so the plot
 * or list the author came from is still mounted and still visible through the
 * backdrop — which is what makes this read as *stepping out of* the app rather
 * than navigating away from it, and is why this is a `Dialog` and not a page.
 *
 * Below `sm` it goes full-bleed instead: at that width `SideNav` is already a
 * horizontal strip, so there is nothing meaningful left to dim and an inset
 * card would spend a seventh of a phone screen on backdrop.
 *
 * Escape closes, and needs no special handling to be safe: the mentions
 * typeahead calls `stopImmediatePropagation` on the key event while it is open,
 * so its own Escape never reaches this dialog.
 */
export function FocusSurface({
  context,
  status,
  menu,
  footer,
  onClose,
  children,
}: {
  /** The breadcrumb line beside the close button — which plot and beat this is. */
  context?: ReactNode;
  /** The autosave indicator. There is no Save button, so this is the only report. */
  status?: ReactNode;
  /** Page-specific overflow items, below the typography choice this surface owns. */
  menu?: (close: () => void) => ReactNode;
  /** Quiet line along the bottom — word count and the like. */
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { face, setFace } = useProseFace();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Chrome recedes on the first keystroke and comes back the moment the author
  // reaches for the mouse. Nothing is removed from the layout, so nothing moves.
  const [typing, setTyping] = useState(false);

  const chromeSx = {
    opacity: typing ? 0.18 : 1,
    transition: theme.transitions.create("opacity", { duration: 260 }),
  };

  const closeMenu = () => setAnchor(null);

  return (
    <Dialog
      open
      fullScreen={fullScreen}
      maxWidth={false}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            // Nearly the whole viewport: this is a place to write, not a form.
            width: "100%",
            height: fullScreen ? "100%" : "calc(100% - 52px)",
            maxWidth: "none",
            m: fullScreen ? 0 : "26px",
            bgcolor: "background.paper",
            backgroundImage: "none",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        },
        backdrop: { sx: { bgcolor: "rgba(28, 24, 21, 0.6)" } },
      }}
      onKeyDownCapture={(event) => {
        // Modifier chords and navigation are not writing; only actual typing
        // should make the chrome withdraw.
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key.length === 1 || event.key === "Enter" || event.key === "Backspace")
          setTyping(true);
      }}
      onPointerMove={() => setTyping(false)}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          pl: { xs: 1, sm: 1.75 },
          // Clears `ColorModeToggle`, which is `position: fixed` in this corner
          // at `zIndex.modal + 1` so it stays usable over any dialog. Its tooltip
          // floats there too, and would swallow clicks meant for this menu.
          pr: 6,
          py: 1,
          ...chromeSx,
        }}
      >
        <Tooltip title="Close (Esc)">
          <IconButton aria-label="Close the writing view" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
        {context ? (
          <Box sx={{ minWidth: 0, flexShrink: 1 }}>{context}</Box>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {status}
        <IconButton
          aria-label="Writing options"
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <MoreHorizIcon />
        </IconButton>
      </Stack>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ px: 2, display: "block", lineHeight: 2.2 }}
        >
          Manuscript face
        </Typography>
        {(["serif", "sans"] as const).map((option) => (
          <MenuItem
            key={option}
            dense
            selected={face === option}
            onClick={() => {
              setFace(option);
              closeMenu();
            }}
          >
            <ListItemIcon>{face === option ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            <ListItemText
              slotProps={{
                primary: {
                  sx: { fontFamily: option === "serif" ? "Georgia, serif" : undefined },
                },
              }}
            >
              {option === "serif" ? "Serif" : "Sans"}
            </ListItemText>
          </MenuItem>
        ))}
        {menu ? <Divider /> : null}
        {menu?.(closeMenu)}
      </Menu>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          justifyContent: "center",
          px: { xs: 2.5, sm: 4 },
        }}
      >
        <Box sx={{ width: "100%", maxWidth: proseMeasure, pt: { xs: 1, sm: 2 }, pb: 10 }}>
          {children}
        </Box>
      </Box>

      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          px: { xs: 2, sm: 3 },
          py: 1.25,
          minHeight: 40,
          ...chromeSx,
        }}
      >
        {footer}
        <Box sx={{ flex: 1 }} />
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: { xs: "none", sm: "block" } }}
        >
          Esc to close
        </Typography>
      </Stack>
    </Dialog>
  );
}
