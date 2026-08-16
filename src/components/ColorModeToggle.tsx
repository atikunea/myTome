import { IconButton, Tooltip } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useColorMode } from "../context/ColorModeContext";

export function ColorModeToggle() {
  const { mode, toggleMode } = useColorMode();
  return (
    <Tooltip title={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}>
      <IconButton
        aria-label="Toggle color mode"
        onClick={toggleMode}
        sx={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: (theme) => theme.zIndex.modal + 1,
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          "&:hover": { bgcolor: "background.paper" },
        }}
        size="small"
      >
        {mode === "light" ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
