import type { SxProps, Theme } from "@mui/material";
import { brandFontFamily } from "../theme";
import { MENTION_ATTRIBUTE } from "../lexical/MentionNode";

/**
 * The manuscript's typography, in **one** place.
 *
 * `StaticProse` and the mounted `ContentEditable` both render from this object,
 * and that is load-bearing rather than tidy: clicking a static section swaps it
 * for a live editor in situ, and if the two disagree by so much as a
 * `line-height` the text jumps under the cursor on every click. It is also what
 * makes caret placement work — the click point is resolved against the *new*
 * DOM after the swap, which only lands on the right word because the two
 * renders occupy identical space.
 *
 * Anything editor-only (`outline`, the placeholder, the caret) is added by the
 * editor on top; anything that affects layout or metrics belongs here.
 */

export type ProseFace = "serif" | "sans";

/**
 * The `theme.text` map handed to the editor, and the same class names
 * `StaticProse` puts on its runs.
 *
 * `bold` and `italic` are here for a reason that is easy to miss: Lexical gives
 * a text node **one** inner tag, chosen bold-before-italic
 * (`getElementInnerTag`), so a run that is both renders as `<strong>` and its
 * italic survives only as a theme class. Without `italic` in this map, bold
 * italic text loses its slant in the editor — and would then disagree with any
 * static render that got it right.
 */
export const proseTextTheme = {
  bold: "editor-bold",
  italic: "editor-italic",
  underline: "editor-underline",
  strikethrough: "editor-strikethrough",
  underlineStrikethrough: "editor-underline-strikethrough",
} as const;

/**
 * The measure, fixed rather than settable. 60–75 characters is the answer for
 * prose, and `ch` is font-relative, so this stays ~66 *characters* when the
 * author switches face instead of jumping width. It is a `max-width`, so a
 * narrow viewport binds first and a phone simply gets its own width.
 */
export const proseMeasure = "66ch";

const sansStack = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

export const proseFontFamily = (face: ProseFace) =>
  face === "serif" ? brandFontFamily : sansStack;

/** Sized so the two faces sit at a comparable x-height rather than a comparable em. */
export const proseFontSize = (face: ProseFace) =>
  face === "serif" ? "1.1875rem" : "1.0625rem";

export function manuscriptSx(face: ProseFace): SxProps<Theme> {
  return {
    fontFamily: proseFontFamily(face),
    fontSize: proseFontSize(face),
    lineHeight: 1.75,
    color: "text.primary",

    "& p": { m: 0, mb: 2 },
    "& h1, & h2, & h3, & h4, & h5, & h6": {
      fontFamily: "inherit",
      mt: 3,
      mb: 1.25,
      lineHeight: 1.25,
      fontWeight: 600,
      "&:first-of-type": { mt: 0 },
    },
    "& h1": { fontSize: "1.65em" },
    "& h2": { fontSize: "1.35em" },
    "& h3": { fontSize: "1.15em" },
    "& h4, & h5, & h6": { fontSize: "1em" },

    "& ul, & ol": { m: 0, mb: 2, pl: 3.5 },
    "& li": { mb: 0.35 },
    // Nested lists close up: the gap already came from the item above them.
    "& li > ul, & li > ol": { mt: 0.35, mb: 0 },

    // Check list items are matched by the role Lexical stamps on them *and* by
    // the data attribute `StaticProse` uses, because a static item is not a
    // control and must not claim to be one. Both spellings have to hit the same
    // rules or a section changes shape the moment it is clicked into.
    //
    // The box is a `::before` because `CheckListPlugin` hit-tests clicks against
    // that pseudo-element's computed width — give it none and the checkbox in a
    // mounted section cannot be ticked.
    '& li[role="checkbox"], & li[data-checklist]': {
      listStyle: "none",
      position: "relative",
      ml: -1.5,
      pl: 3,
      outline: "none",
      "&::before": {
        content: '""',
        position: "absolute",
        left: 0,
        top: "0.35em",
        width: 16,
        height: 16,
        boxSizing: "border-box",
        border: 1.5,
        borderColor: "text.disabled",
        borderRadius: "3px",
        cursor: "pointer",
      },
    },
    '& li[role="checkbox"][aria-checked="true"], & li[data-checklist][data-checked="true"]': {
      color: "text.secondary",
      textDecoration: "line-through",
      "&::before": { bgcolor: "primary.main", borderColor: "primary.main" },
      "&::after": {
        content: '""',
        position: "absolute",
        left: 5,
        top: "calc(0.35em + 2px)",
        width: 5,
        height: 9,
        borderStyle: "solid",
        borderColor: "primary.contrastText",
        borderWidth: "0 2px 2px 0",
        transform: "rotate(45deg)",
        pointerEvents: "none",
      },
    },

    // Lexical emits `<strong>`/`<em>` for a run that is bold *or* italic, and
    // falls back to these classes when it is both. `StaticProse` emits the same
    // names by the same rules, so one set of declarations covers both renders.
    "& .editor-bold": { fontWeight: 700 },
    "& .editor-italic": { fontStyle: "italic" },
    "& .editor-underline": { textDecoration: "underline" },
    "& .editor-strikethrough": { textDecoration: "line-through" },
    "& .editor-underline-strikethrough": { textDecoration: "underline line-through" },

    "& a": { color: "primary.main", textDecoration: "underline" },
    "& code": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "0.88em",
      bgcolor: "action.hover",
      px: 0.5,
      py: "0.1em",
      borderRadius: "4px",
    },
    "& mark": {
      bgcolor: "warning.light",
      color: "text.primary",
      px: 0.25,
      borderRadius: "2px",
    },
    // Keeps a sub/sup from stretching the line it sits on.
    "& sub, & sup": { fontSize: "0.75em", lineHeight: 0 },
    "& blockquote": {
      borderLeft: 3,
      borderColor: "divider",
      color: "text.secondary",
      m: 0,
      mb: 2,
      pl: 2,
    },

    // Mentions are styled from here rather than in `createDOM`, which runs
    // outside React and cannot reach the MUI theme.
    [`& [${MENTION_ATTRIBUTE}]`]: {
      color: "primary.main",
      textDecoration: "underline",
      cursor: "pointer",
      borderRadius: "3px",
      "&:hover": { bgcolor: "action.hover" },
    },
  };
}
