import { Box, GlobalStyles, Portal, Typography } from "@mui/material";
import type { Manuscript } from "../services/manuscript";
import { MENTION_ATTRIBUTE } from "../lexical/MentionNode";
import { StaticProse } from "./StaticProse";
import { manuscriptSx, proseFontFamily, type ProseFace } from "./manuscriptStyles";

/**
 * The manuscript as printed paper — which is also how the PDF is made.
 *
 * There is no PDF library in this app. The browser already has a typesetter and
 * a PDF writer, and the manuscript is already described by `manuscriptStyles.ts`
 * down to its leading, so printing this component reuses both and the exported
 * PDF is typographically the surface the author wrote on. A library would cost
 * a couple of megabytes on a static bundle to reproduce, less well, what is
 * already sitting there.
 *
 * **Why the whole app is hidden rather than this being rendered alone:** the
 * export lives on a route over the workspace, so at print time the app, its
 * dialog and this document are all in the page. The rules below blank every
 * child of `<body>` and un-blank this one, which is portalled to `<body>` so it
 * is a child there to un-blank. Rendering into a separate window instead would
 * leave emotion's style tags behind and print the manuscript unstyled.
 *
 * Mount it only while printing. A whole plot line is a lot of DOM to keep laid
 * out for a dialog nobody has printed from yet.
 */

const PRINT_ROOT = "mytome-print-root";

/**
 * Paper is white in both color modes.
 *
 * `manuscriptSx` is written in theme tokens, which is right on screen and wrong
 * on paper: printed from dark mode it would put near-white text and a pale tan
 * link colour onto a white page. Every token that resolves to a colour is
 * restated here in ink, so what prints does not depend on which mode the author
 * happened to be in.
 */
const inkSx = {
  color: "#000",
  "& a": { color: "#000" },
  "& blockquote": { borderColor: "#666", color: "#000" },
  "& code": { bgcolor: "transparent", border: "1px solid #ccc" },
  "& mark": { bgcolor: "transparent", color: "#000", textDecoration: "underline" },
  // A mention is an author's cross-reference to something that exists only in
  // this app. On paper it is simply the name.
  [`& [${MENTION_ATTRIBUTE}]`]: {
    color: "#000",
    textDecoration: "none",
    bgcolor: "transparent",
  },
  '& li[role="checkbox"]::before, & li[data-checklist]::before': {
    borderColor: "#000",
  },
  '& li[role="checkbox"][aria-checked="true"], & li[data-checklist][data-checked="true"]':
    {
      color: "#000",
      "&::before": { bgcolor: "#000", borderColor: "#000" },
      "&::after": { borderColor: "#fff" },
    },
} as const;

export function ManuscriptPrint({
  manuscript,
  face,
}: {
  manuscript: Manuscript;
  face: ProseFace;
}) {
  return (
    <Portal>
      <GlobalStyles
        styles={{
          // On screen the document is mounted but has no business being seen.
          [`.${PRINT_ROOT}`]: { display: "none" },
          "@media print": {
            "body > *": { display: "none !important" },
            [`body > .${PRINT_ROOT}`]: { display: "block !important" },
            "@page": { margin: "1in" },
            body: { background: "#fff" },
          },
        }}
      />
      <Box className={PRINT_ROOT} sx={{ background: "#fff" }}>
        {manuscript.beats.map((beat, index) => (
          <Box
            key={beat.beatId}
            component="section"
            sx={{
              // The first beat must not break, or the document opens on a blank
              // page. Every later one does — that is the whole shape of this.
              breakBefore: index === 0 ? "auto" : "page",
              ...(manuscriptSx(face) as object),
              fontSize: "12pt",
              ...inkSx,
            }}
          >
            {beat.heading !== undefined && (
              <Typography
                component="h1"
                sx={{
                  fontFamily: proseFontFamily(face),
                  fontSize: "1.4em",
                  fontWeight: 600,
                  textAlign: "center",
                  color: "#000",
                  mb: 3,
                  // A heading stranded at the foot of a page is the one widow
                  // worth spending a rule on.
                  breakAfter: "avoid",
                  breakInside: "avoid",
                }}
              >
                {beat.heading}
              </Typography>
            )}
            {beat.sections.map((section) => (
              <StaticProse key={section.writeItemId} blocks={section.blocks} />
            ))}
          </Box>
        ))}
      </Box>
    </Portal>
  );
}
