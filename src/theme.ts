import { createTheme, type PaletteMode, type ThemeOptions } from "@mui/material/styles";

import gelasioLatin from "./assets/fonts/gelasio-latin.woff2";
import gelasioLatinExt from "./assets/fonts/gelasio-latin-ext.woff2";
import gelasioItalicLatin from "./assets/fonts/gelasio-italic-latin.woff2";
import gelasioItalicLatinExt from "./assets/fonts/gelasio-italic-latin-ext.woff2";

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

/**
 * Google's own subset ranges for this font, kept verbatim so a `latin-ext`
 * file is fetched only by text that needs it.
 */
const latinRange =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const latinExtRange =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

/** Each file is a variable font covering the whole 400–700 range in one style. */
const gelasioFace = (src: string, style: "normal" | "italic", range: string) => `
@font-face {
  font-family: 'Gelasio';
  font-style: ${style};
  font-weight: 400 700;
  font-display: swap;
  src: url(${src}) format('woff2');
  unicode-range: ${range};
}`;

/**
 * Shipped because `brandFontFamily` below cannot rely on the host having
 * Georgia. Attached to `MuiCssBaseline` in `getTheme`, which is how CSS enters
 * an app with no stylesheet of its own.
 */
export const gelasioFontFaces = [
  gelasioFace(gelasioLatin, "normal", latinRange),
  gelasioFace(gelasioLatinExt, "normal", latinExtRange),
  gelasioFace(gelasioItalicLatin, "italic", latinRange),
  gelasioFace(gelasioItalicLatinExt, "italic", latinExtRange),
].join("\n");

/**
 * The brand serif, and the one place this app ships a font rather than naming
 * one.
 *
 * **Georgia stays first**, so Windows and macOS render exactly what they always
 * have and never download a byte — a face is only fetched when it is actually
 * needed to draw something. Neither Georgia nor Times New Roman exists on most
 * Linux distributions, though; they are Microsoft core fonts, not free ones. So
 * without a bundled face the app there falls through to whatever generic
 * `serif` happens to resolve to.
 *
 * That is cosmetic nearly everywhere, and **not cosmetic in
 * `ManuscriptPrint`**: `components/manuscriptStyles.ts` records a line-width
 * calibration measured against Georgia, so a different serif silently moves the
 * measure the author chose. Gelasio is metric-compatible with Georgia, which is
 * why it is the fallback and not simply a serif someone liked — the calibration
 * holds on all three platforms.
 */
export const brandFontFamily = "Georgia, Gelasio, 'Times New Roman', serif";

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
      MuiCssBaseline: { styleOverrides: gelasioFontFaces },
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
