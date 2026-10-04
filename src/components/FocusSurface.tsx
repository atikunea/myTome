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
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import CheckIcon from "@mui/icons-material/Check";
import { useProseFace } from "../context/ProseFaceContext";
import {
  defaultProseMeasure,
  firstLineIndentSx,
  proseFaces,
  proseFontFamily,
  proseMeasures,
  proseMeasureWidth,
  type ProseFace,
  type ProseMeasure,
} from "./manuscriptStyles";

const faceLabels: Record<ProseFace, string> = { serif: "Serif", sans: "Sans", mono: "Mono" };

const measureLabels: Record<ProseMeasure, string> = {
  narrow: "Narrow",
  medium: "Medium",
  wide: "Wide",
  full: "Full width",
};

/**
 * The measure is a preference of this browser, like the face, but only this
 * surface reads it — so it keeps its own `localStorage` key here instead of a
 * context. The privacy page's storage list names it.
 */
const MEASURE_KEY = "mytome:prose-measure";

function initialMeasure(): ProseMeasure {
  try {
    const stored = localStorage.getItem(MEASURE_KEY);
    return proseMeasures.find((measure) => measure === stored) ?? defaultProseMeasure;
  } catch {
    return defaultProseMeasure;
  }
}

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
  aside,
  onClose,
  children,
}: {
  /** The breadcrumb line beside the close button — which plot and beat this is. */
  context?: ReactNode;
  /** The autosave indicator. There is no Save button, so this is the only report. */
  status?: ReactNode;
  /** Page-specific overflow items, below the typography choices this surface owns. */
  menu?: (close: () => void) => ReactNode;
  /** Quiet line along the bottom — word count and the like. */
  footer?: ReactNode;
  /**
   * A panel down the left of the manuscript — what the page knows *about* the
   * prose, as opposed to the prose. Hidden below `sm`, where the surface is
   * full-bleed and every column belongs to the text, and hideable above it.
   * Its width never changes while a section is live, so the static/live swap
   * still lands on the same layout.
   */
  aside?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { face, setFace, firstLineIndent, setFirstLineIndent } = useProseFace();
  const [measure, setMeasure] = useState(initialMeasure);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Chrome recedes on the first keystroke and comes back the moment the author
  // reaches for the mouse. Nothing is removed from the layout, so nothing moves.
  const [typing, setTyping] = useState(false);
  // Shown by default: the panel is there to be read beside the prose. Hiding
  // it is a moment's choice, so it is not remembered past this surface.
  const [asideOpen, setAsideOpen] = useState(true);

  const chromeSx = {
    opacity: typing ? 0.18 : 1,
    transition: theme.transitions.create("opacity", { duration: 260 }),
  };

  const closeMenu = () => setAnchor(null);

  const chooseMeasure = (option: ProseMeasure) => {
    setMeasure(option);
    try {
      localStorage.setItem(MEASURE_KEY, option);
    } catch {
      // Storage refused: the width still holds for this visit.
    }
  };

  const menuHeading = (label: string) => (
    <Typography
      variant="overline"
      color="text.secondary"
      sx={{ px: 2, display: "block", lineHeight: 2.2 }}
    >
      {label}
    </Typography>
  );

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
            // The page's own ground, not paper: prose sits on the night, and
            // the chrome above it is the step darker the nav is.
            bgcolor: "background.default",
            backgroundImage: "none",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        },
        backdrop: { sx: { bgcolor: (t) => t.loom.backdrop } },
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
          bgcolor: (t) => t.loom.nav,
          borderBottom: 1,
          borderColor: "divider",
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
        {aside ? (
          <Tooltip title={asideOpen ? "Hide the panel" : "Show the panel"}>
            <IconButton
              aria-label={asideOpen ? "Hide the panel" : "Show the panel"}
              aria-pressed={asideOpen}
              onClick={() => setAsideOpen((open) => !open)}
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              <ViewSidebarOutlinedIcon sx={{ transform: "scaleX(-1)" }} />
            </IconButton>
          </Tooltip>
        ) : null}
        <IconButton
          aria-label="Writing options"
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <MoreHorizIcon />
        </IconButton>
      </Stack>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}>
        {menuHeading("Manuscript face")}
        {proseFaces.map((option) => (
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
              slotProps={{ primary: { sx: { fontFamily: proseFontFamily(option) } } }}
            >
              {faceLabels[option]}
            </ListItemText>
          </MenuItem>
        ))}
        <Divider />
        {menuHeading("Line width")}
        {proseMeasures.map((option) => (
          <MenuItem
            key={option}
            dense
            selected={measure === option}
            onClick={() => {
              chooseMeasure(option);
              closeMenu();
            }}
          >
            <ListItemIcon>
              {measure === option ? <CheckIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText>{measureLabels[option]}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        {menuHeading("Paragraphs")}
        <MenuItem
          dense
          role="menuitemcheckbox"
          aria-checked={firstLineIndent}
          onClick={() => {
            setFirstLineIndent(!firstLineIndent);
            closeMenu();
          }}
        >
          <ListItemIcon>{firstLineIndent ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
          <ListItemText>Indent first lines</ListItemText>
        </MenuItem>
        {menu ? <Divider /> : null}
        {menu?.(closeMenu)}
      </Menu>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
      {aside && asideOpen ? (
        <Box
          component="aside"
          sx={{
            display: { xs: "none", sm: "block" },
            width: 300,
            flexShrink: 0,
            overflowY: "auto",
            borderRight: 1,
            borderColor: "divider",
            p: 2.5,
            ...chromeSx,
          }}
        >
          {aside}
        </Box>
      ) : null}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          justifyContent: "center",
          px: { xs: 2.5, sm: 4 },
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: proseMeasureWidth(measure),
            pt: { xs: 1, sm: 2 },
            pb: 10,
            // Set here, on the column holding every section, so the static and
            // the live render pick it up together.
            ...(firstLineIndent ? firstLineIndentSx : {}),
          }}
        >
          {children}
        </Box>
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
