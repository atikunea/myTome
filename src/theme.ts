import { createTheme, type PaletteMode, type ThemeOptions } from "@mui/material/styles";

const brand = {
  accent: "#9d5537",
  accentDark: "#c98a5e",
  danger: "#b63b3b",
  // A muted plum that reads as a second voice against the warm paper palette —
  // used for plot dots/connectors, where MUI's default purple would clash.
  secondary: "#6b4a6e",
  secondaryDark: "#a888ab",
};

const lightPalette: ThemeOptions["palette"] = {
  mode: "light" as PaletteMode,
  primary: { main: brand.accent, contrastText: "#ffffff" },
  secondary: { main: brand.secondary, contrastText: "#ffffff" },
  error: { main: brand.danger },
  background: { default: "#fdfbf8", paper: "#ffffff" },
  text: { primary: "#29211e", secondary: "#766b65" },
  divider: "#e5ddd6",
  warning: { main: "#c9932c", light: "#f9ebc3" },
  success: { main: "#4c8a55", light: "#d7ecd9" },
};

const darkPalette: ThemeOptions["palette"] = {
  mode: "dark" as PaletteMode,
  primary: { main: brand.accentDark, contrastText: "#241a12" },
  secondary: { main: brand.secondaryDark, contrastText: "#241a12" },
  error: { main: "#e07272" },
  background: { default: "#1c1815", paper: "#251f1a" },
  text: { primary: "#f3ece6", secondary: "#b8a99e" },
  divider: "#453b34",
  warning: { main: "#d6a94c", light: "#4a3d21" },
  success: { main: "#6fae78", light: "#25352a" },
};

export const brandFontFamily = "Georgia, 'Times New Roman', serif";

export function getTheme(mode: PaletteMode) {
  return createTheme({
    palette: mode === "light" ? lightPalette : darkPalette,
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      h1: { letterSpacing: "-0.03em" },
      h2: { letterSpacing: "-0.02em" },
    },
    components: {
      MuiCard: {
        styleOverrides: { root: { borderRadius: 14 } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 9, fontWeight: 700 } },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 700 } },
      },
    },
  });
}
