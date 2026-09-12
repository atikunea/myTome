import { Box, GlobalStyles, Portal, Typography } from "@mui/material";
import type {
  Manuscript,
  ManuscriptAuthorPage,
  ManuscriptTitlePage,
} from "../services/manuscript";
import { MENTION_ATTRIBUTE } from "../lexical/MentionNode";
import { useImageSrc } from "../hooks/useObjectUrl";
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

/**
 * Resolves once every image in the print document has loaded — the cover and
 * the author's photo. The browser snapshots the page when `print()` is called,
 * and an image still loading at that moment prints as a blank box: an uploaded
 * one is only given its object URL in a layout effect, and a linked one has a
 * network round trip ahead of it. One that fails to load does not hold the
 * print up; it prints as whatever the browser draws for it.
 *
 * It waits on `load`, **not** `decode()`, which never settles while the page is
 * hidden — see `imageForDocx` in `ManuscriptExportDialog`, where that hung.
 */
export const printImagesReady = () =>
  Promise.all(
    Array.from(document.querySelectorAll<HTMLImageElement>(`.${PRINT_ROOT} img`)).map(
      (image) =>
        image.complete
          ? undefined
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
    ),
  );

/**
 * The title page: cover, title, subtitle and byline, centred on the page both
 * ways. `100vh` is what makes that work on paper — in print a viewport unit
 * resolves against the page's printable area, so the box is exactly one page
 * tall inside the `@page` margins, whatever size of paper is chosen. Measured
 * by printing to PDF, not assumed: the box filled the first page to its
 * margins and the first beat opened on the second.
 */
function TitlePage({ page, face }: { page: ManuscriptTitlePage; face: ProseFace }) {
  const cover = useImageSrc(page.cover);
  return (
    <Box
      component="section"
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        breakAfter: "page",
        breakInside: "avoid",
        overflow: "hidden",
        fontFamily: proseFontFamily(face),
        color: "#000",
      }}
    >
      {cover && (
        <Box
          component="img"
          src={cover}
          alt=""
          sx={{ maxWidth: "70%", maxHeight: "45vh", objectFit: "contain", mb: 5 }}
        />
      )}
      <Typography
        component="h1"
        sx={{ fontFamily: "inherit", fontSize: "28pt", fontWeight: 700, lineHeight: 1.2 }}
      >
        {page.title}
      </Typography>
      {page.subtitle && (
        <Typography
          sx={{ fontFamily: "inherit", fontSize: "16pt", fontStyle: "italic", mt: 1.5 }}
        >
          {page.subtitle}
        </Typography>
      )}
      {page.byline && (
        <Typography sx={{ fontFamily: "inherit", fontSize: "15pt", mt: 5 }}>
          {page.byline}
        </Typography>
      )}
    </Box>
  );
}

/**
 * The author page: the photo with the bio below it, centred on the page both
 * ways, after the last beat.
 *
 * `minHeight`, not the title page's `height`: a title page holds four short
 * lines, but a bio is the author's own prose and can run past a page, which a
 * fixed height with `overflow: hidden` would silently cut off. A bio that fits
 * is centred on its page exactly as the title page is; a longer one simply
 * flows on. The bio reads through `StaticProse` in the manuscript's own face,
 * and a paragraph with no alignment of its own takes the page's centring.
 */
function AuthorPage({ page, face }: { page: ManuscriptAuthorPage; face: ProseFace }) {
  const photo = useImageSrc(page.photo);
  return (
    <Box
      component="section"
      sx={{
        breakBefore: "page",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {photo && (
        <Box
          component="img"
          src={photo}
          alt=""
          sx={{ maxWidth: "50%", maxHeight: "40vh", objectFit: "contain", mb: 4 }}
        />
      )}
      {page.blocks.length > 0 && (
        <Box
          sx={{
            ...(manuscriptSx(face) as object),
            fontSize: "12pt",
            textAlign: "center",
            width: "100%",
            ...inkSx,
            // The last paragraph's bottom margin would sit inside the centred
            // box and lift the whole page by half of it.
            "& > :last-child": { mb: 0 },
          }}
        >
          <StaticProse blocks={page.blocks} />
        </Box>
      )}
    </Box>
  );
}

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
        {manuscript.titlePage && <TitlePage page={manuscript.titlePage} face={face} />}
        {manuscript.beats.map((beat, index) => (
          <Box
            key={beat.beatId}
            component="section"
            sx={{
              // The first beat must not break, or the document opens on a blank
              // page — the title page, when there is one, already breaks after
              // itself. Every later one does; that is the whole shape of this.
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
        {manuscript.authorPage && <AuthorPage page={manuscript.authorPage} face={face} />}
      </Box>
    </Portal>
  );
}
