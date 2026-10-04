import { createTheme, type PaletteMode, type Theme, type ThemeOptions } from "@mui/material/styles";

import gelasioLatin from "./assets/fonts/gelasio-latin.woff2";
import gelasioLatinExt from "./assets/fonts/gelasio-latin-ext.woff2";
import gelasioItalicLatin from "./assets/fonts/gelasio-italic-latin.woff2";
import gelasioItalicLatinExt from "./assets/fonts/gelasio-italic-latin-ext.woff2";
import bricolageLatin from "./assets/fonts/bricolage-latin.woff2";
import bricolageLatinExt from "./assets/fonts/bricolage-latin-ext.woff2";
import fragmentMonoLatin from "./assets/fonts/fragment-mono-latin.woff2";
import fragmentMonoLatinExt from "./assets/fonts/fragment-mono-latin-ext.woff2";

/**
 * **Loom** — the app's look. Every plot is a coloured thread pulled down the
 * tome's shared spine (the "warp"), and every beat is a tag knotted onto it.
 * Night blue is the ground, brass marks whatever the author is touching, and
 * the thread colours are the only other voices: they are how a plot is told
 * apart in the nav, in the tabs and down its column of the grid.
 *
 * Dark is the first mode and light the alternate. Both are drawn from the same
 * token names, so a component asks for `loom.nav` or `loom.threads` and never
 * for a colour, and the light set deepens the threads and the brass ink until
 * they read on white rather than simply inverting the dark one.
 */
export interface LoomTokens {
  /** The side nav's ground — a step darker (or, in light, a step tinted) from the page. */
  nav: string;
  /** Inset surfaces: the plot grid's well, quiet panels. */
  panel: string;
  /** A chip's fill. */
  chip: string;
  /** Hairline rings: row numbers, hollow knots. */
  ring: string;
  /** The brass a contained button is filled with — the same in both modes. */
  brass: string;
  /** Brass as ink: text and outlines that have to pass contrast on the ground. */
  brassInk: string;
  /** A wash of brass for the selected nav item and focus rings. */
  brassSoft: string;
  brassLine: string;
  /** How far a knot's glow reaches. Zero in light mode, where a glow reads as a smudge. */
  halo: number;
  /** A resting card's shadow. None in dark mode, where the border does the work. */
  lift: string;
  /** The writing surface's scrim. */
  backdrop: string;
  /** Plot thread colours, assigned by a plot's position in its tome. */
  threads: readonly string[];
}

declare module "@mui/material/styles" {
  interface Theme {
    loom: LoomTokens;
  }
  interface ThemeOptions {
    loom?: LoomTokens;
  }
}

const darkLoom: LoomTokens = {
  nav: "#0b0e1f",
  panel: "#0c0f22",
  chip: "#232850",
  ring: "#3a4078",
  brass: "#e7b95a",
  brassInk: "#f3d48f",
  brassSoft: "rgba(231, 185, 90, 0.12)",
  brassLine: "rgba(231, 185, 90, 0.45)",
  halo: 14,
  lift: "none",
  backdrop: "rgba(5, 7, 20, 0.72)",
  threads: ["#e7b95a", "#f08a6c", "#6fd3c1", "#b79cff", "#7fb2f0", "#e58fb6"],
};

const lightLoom: LoomTokens = {
  nav: "#ebeaf6",
  panel: "#fbfbfe",
  chip: "#eeedf8",
  ring: "#b9b8d6",
  brass: "#e7b95a",
  brassInk: "#7a5612",
  brassSoft: "rgba(196, 146, 47, 0.13)",
  brassLine: "rgba(160, 112, 24, 0.5)",
  halo: 0,
  lift: "0 1px 2px rgba(22, 26, 51, 0.06), 0 8px 22px rgba(22, 26, 51, 0.07)",
  backdrop: "rgba(22, 26, 51, 0.45)",
  threads: ["#c4922f", "#d9623f", "#1e9c88", "#7c5ce0", "#3f7fd1", "#c2508a"],
};

/**
 * The thread a plot is drawn in. By position rather than by id, so three plots
 * are always three different colours; the cost is that reordering the plot
 * tabs recolours them, everywhere at once.
 */
export const threadColor = (theme: Theme, index: number) =>
  theme.loom.threads[Math.max(index, 0) % theme.loom.threads.length];

const lightPalette: ThemeOptions["palette"] = {
  mode: "light" as PaletteMode,
  // Brass as *ink*: dark enough to be text on the pale ground. The contained
  // button keeps the bright brass through its own override below.
  primary: { main: "#8a6416", contrastText: "#ffffff" },
  secondary: { main: "#c4512f", contrastText: "#ffffff" },
  error: { main: "#c43a3a" },
  info: { main: "#1e8a79" },
  background: { default: "#f4f3fb", paper: "#ffffff" },
  text: { primary: "#161a33", secondary: "#5b5f86" },
  divider: "#dcdbec",
  warning: { main: "#b7791f", light: "#fbecc4" },
  success: { main: "#2f8a55", light: "#d6f0df" },
};

const darkPalette: ThemeOptions["palette"] = {
  mode: "dark" as PaletteMode,
  primary: { main: "#e7b95a", contrastText: "#1a1405" },
  secondary: { main: "#f08a6c", contrastText: "#1a1405" },
  error: { main: "#ff8a8a" },
  info: { main: "#6fd3c1" },
  background: { default: "#0f1226", paper: "#171b36" },
  text: { primary: "#eceaf6", secondary: "#a9abcc" },
  divider: "#2c3260",
  warning: { main: "#e7b95a", light: "#3d3420" },
  success: { main: "#7fd49a", light: "#1f3a33" },
};

/**
 * Google's own subset ranges, kept verbatim so a `latin-ext` file is fetched
 * only by text that needs it. Every bundled face is split the same way.
 */
const latinRange =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const latinExtRange =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

const fontFace = (
  family: string,
  src: string,
  style: "normal" | "italic",
  weight: string,
  range: string,
) => `
@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url(${src}) format('woff2');
  unicode-range: ${range};
}`;

/**
 * Every face this app ships, attached to `MuiCssBaseline` in `getTheme`, which
 * is how CSS enters an app with no stylesheet of its own. They are bundled
 * rather than linked because the built page's CSP allows no font host.
 *
 * Gelasio is variable over 400–700 in each style; Bricolage Grotesque is
 * variable over weight *and* optical size (200–800), which is what lets one
 * family be inky at 56px and open at 13px; Fragment Mono has one weight.
 */
export const bundledFontFaces = [
  fontFace("Gelasio", gelasioLatin, "normal", "400 700", latinRange),
  fontFace("Gelasio", gelasioLatinExt, "normal", "400 700", latinExtRange),
  fontFace("Gelasio", gelasioItalicLatin, "italic", "400 700", latinRange),
  fontFace("Gelasio", gelasioItalicLatinExt, "italic", "400 700", latinExtRange),
  fontFace("Bricolage Grotesque", bricolageLatin, "normal", "200 800", latinRange),
  fontFace("Bricolage Grotesque", bricolageLatinExt, "normal", "200 800", latinExtRange),
  fontFace("Fragment Mono", fragmentMonoLatin, "normal", "400", latinRange),
  fontFace("Fragment Mono", fragmentMonoLatinExt, "normal", "400", latinExtRange),
].join("\n");

/**
 * The manuscript's serif, and the default prose face.
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
 * holds on all three platforms. Loom changed the interface around it and
 * deliberately not this.
 */
export const brandFontFamily = "Georgia, Gelasio, 'Times New Roman', serif";

/**
 * The interface face, and the app's default. Exported rather than written
 * inline below because `components/manuscriptStyles.ts` offers it as one of the
 * three prose faces — and a second copy of this string there would be free to
 * drift from the one everything else is set in.
 */
export const sansFontFamily =
  "'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Counts, row numbers, timestamps — the interface's small print. Never prose. */
export const monoFontFamily =
  "'Fragment Mono', ui-monospace, 'Cascadia Mono', SFMono-Regular, Menlo, Consolas, monospace";

export function getTheme(mode: PaletteMode) {
  const loom = mode === "light" ? lightLoom : darkLoom;
  return createTheme({
    palette: mode === "light" ? lightPalette : darkPalette,
    loom,
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: sansFontFamily,
      h1: { fontWeight: 700, letterSpacing: "-0.035em" },
      h2: { fontWeight: 700, letterSpacing: "-0.03em" },
      h3: { fontWeight: 700, letterSpacing: "-0.025em" },
      h4: { fontWeight: 600, letterSpacing: "-0.02em" },
      h5: { fontWeight: 600, letterSpacing: "-0.015em" },
      h6: { fontWeight: 600, letterSpacing: "-0.01em" },
      button: { textTransform: "none", fontWeight: 600 },
      overline: {
        fontFamily: monoFontFamily,
        fontWeight: 400,
        fontSize: "0.7rem",
        letterSpacing: "0.08em",
      },
    },
    components: {
      MuiCssBaseline: { styleOverrides: bundledFontFaces },
      // Dark-mode paper in MUI lightens with elevation through a white overlay
      // image, which turns night blue grey. Loom's surfaces are tokens instead.
      MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 16,
            boxShadow: theme.loom.lift,
            border: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme }) => ({
            borderRadius: 20,
            border: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => ({
            borderRadius: 14,
            border: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999, paddingInline: 18 },
          sizeSmall: { paddingInline: 12 },
        },
        variants: [
          // The bright brass in both modes. In light mode `primary.main` is
          // brass *ink*, too dark to be a fill the eye reads as brass.
          {
            props: { variant: "contained", color: "primary" },
            style: ({ theme }) => ({
              backgroundColor: theme.loom.brass,
              color: "#1a1405",
              "&:hover": { backgroundColor: "#f0c66e" },
            }),
          },
          {
            props: { variant: "outlined", color: "primary" },
            style: ({ theme }) => ({ borderColor: theme.loom.brassLine }),
          },
        ],
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 500, borderRadius: 999 },
          filled: ({ theme }) => ({ backgroundColor: theme.loom.chip }),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 14,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: theme.palette.divider },
            "&.Mui-focused": { boxShadow: `0 0 0 4px ${theme.loom.brassSoft}` },
          }),
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: "none", fontWeight: 500, fontSize: "0.9rem" } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: ({ theme }) => ({
            borderRadius: 10,
            fontSize: "0.75rem",
            backgroundColor: theme.palette.mode === "dark" ? "#252a52" : "#161a33",
          }),
        },
      },
    },
  });
}
