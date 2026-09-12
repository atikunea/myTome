import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
  VerticalAlignSection,
  type ILevelsOptions,
  type IParagraphOptions,
  type IRunOptions,
  type ISectionOptions,
} from "docx";
import type { Align, Block, Inline, InlineFormat, ListEntry } from "../lexical/blocks";
import type {
  Manuscript,
  ManuscriptAuthorPage,
  ManuscriptBeat,
  ManuscriptTitlePage,
} from "./manuscript";

/**
 * A `Manuscript` as a Word document. Transport, not decision: `manuscript.ts`
 * has already settled what is in the document and in what order, and everything
 * here is the mapping from our `Block` tree onto OOXML.
 *
 * The mapping is a pure function (`manuscriptParagraphs`) with the one impure
 * call — `Packer.toBlob` — kept at the very edge, so the part worth testing runs
 * under `node` like the rest of `services/`.
 *
 * Two places Word simply has no equivalent, handled rather than hidden:
 *
 * - **Check lists.** Word has no check-list item, so a checked or unchecked box
 *   is written as a box glyph on an indented paragraph. It reads correctly and
 *   stays editable; it is not a Word control and cannot be ticked.
 * - **A list's `start`.** Preserved by giving every ordered list its own
 *   numbering definition rather than sharing one, which is also what keeps two
 *   consecutive lists from continuing each other's count.
 *
 * Prose headings map straight through (`h1` to Heading 1). A beat heading is
 * also Heading 1, so an author who used `h1` inside a section will see both at
 * the same level in Word's navigation pane. That is the honest rendering — the
 * alternative is silently demoting the author's own headings.
 */

/** One inch, in twips — Word's unit for margins and indents. */
const INCH = 1440;

/** Matched to `manuscriptStyles.ts`: one indent step is Lexical's 40px default. */
const INDENT_STEP = Math.round(INCH * 0.42);

const alignments: Partial<Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]>> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
  start: AlignmentType.START,
  end: AlignmentType.END,
};

const headingLevels = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
} as const;

const frame = (align: Align, indent: number): IParagraphOptions => ({
  ...(alignments[align] ? { alignment: alignments[align] } : {}),
  ...(indent > 0 ? { indent: { left: indent * INDENT_STEP } } : {}),
});

/** Our `InlineFormat` set as Word run properties. */
function runOptions(formats: InlineFormat[]): IRunOptions {
  const set = new Set(formats);
  return {
    ...(set.has("bold") ? { bold: true } : {}),
    ...(set.has("italic") ? { italics: true } : {}),
    ...(set.has("underline") ? { underline: {} } : {}),
    ...(set.has("strikethrough") ? { strike: true } : {}),
    ...(set.has("superscript") ? { superScript: true } : {}),
    ...(set.has("subscript") ? { subScript: true } : {}),
    ...(set.has("code") ? { font: "Consolas" } : {}),
    ...(set.has("highlight") ? { highlight: "yellow" } : {}),
  };
}

/**
 * Inline content as Word runs. A mention becomes its plain text — the element it
 * names lives only in this app, so a link out of the document would point at
 * nothing a reader could open.
 */
function toRuns(inlines: Inline[]): (TextRun | ExternalHyperlink)[] {
  const runs: (TextRun | ExternalHyperlink)[] = [];
  for (const inline of inlines) {
    if (inline.kind === "break") {
      runs.push(new TextRun({ break: 1 }));
      continue;
    }
    if (inline.kind === "link") {
      const children = toRuns(inline.children).filter(
        (run): run is TextRun => run instanceof TextRun,
      );
      runs.push(new ExternalHyperlink({ children, link: inline.url }));
      continue;
    }
    runs.push(new TextRun({ text: inline.text, ...runOptions(inline.formats) }));
  }
  return runs;
}

/**
 * A numbering definition per ordered list, collected while the blocks are
 * walked. Sharing one definition would make a second list continue the first
 * one's count and would lose any list that does not start at 1.
 */
type Numbering = { reference: string; levels: ILevelsOptions[] }[];

const orderedLevels = (start: number) =>
  Array.from({ length: 5 }, (_, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    start: level === 0 ? start : 1,
    style: {
      paragraph: {
        indent: { left: (level + 1) * INDENT_STEP, hanging: 360 },
      },
    },
  }));

/**
 * `pageBreakBefore` as paragraph options, spread onto whichever paragraph turns
 * out to be first. `docx` freezes a paragraph's formatting when it is
 * constructed, so the break has to be decided on the way down rather than added
 * afterwards — which is why `breakBefore` is threaded through these functions
 * instead of being applied to a finished list.
 */
const breaking = (breakBefore: boolean): IParagraphOptions =>
  breakBefore ? { pageBreakBefore: true } : {};

function listParagraphs(
  block: Extract<Block, { kind: "list" }>,
  numbering: Numbering,
  level: number,
  breakBefore: boolean,
): Paragraph[] {
  const out: Paragraph[] = [];

  // Every ordered list gets its own definition so its `start` survives and its
  // count cannot bleed into the next list.
  let reference = "";
  if (block.listType === "number") {
    reference = `ordered-${numbering.length}`;
    numbering.push({ reference, levels: orderedLevels(block.start) });
  }

  const entryParagraph = (entry: ListEntry, first: boolean): Paragraph => {
    const opening = breaking(breakBefore && first);
    if (block.listType === "check")
      return new Paragraph({
        ...frame("", block.indent + level + 1),
        ...opening,
        children: [
          new TextRun({ text: entry.checked ? "☑ " : "☐ " }),
          ...toRuns(entry.content),
        ],
      });
    if (block.listType === "number")
      return new Paragraph({
        numbering: { reference, level },
        ...opening,
        children: toRuns(entry.content),
      });
    return new Paragraph({
      bullet: { level },
      ...opening,
      children: toRuns(entry.content),
    });
  };

  block.entries.forEach((entry, index) => {
    out.push(entryParagraph(entry, index === 0));
    for (const child of entry.children) {
      if (child.kind === "list")
        out.push(...listParagraphs(child, numbering, level + 1, false));
      // A non-list block nested in a list item is a continuation paragraph of
      // that item, so it takes the item's indent rather than a bullet.
      else out.push(...blockParagraphs(child, numbering, level + 1, false));
    }
  });
  return out;
}

function blockParagraphs(
  block: Block,
  numbering: Numbering,
  level = 0,
  breakBefore = false,
): Paragraph[] {
  switch (block.kind) {
    case "paragraph":
      return [
        new Paragraph({
          ...frame(block.align, block.indent + level),
          ...breaking(breakBefore),
          children: toRuns(block.content),
        }),
      ];
    case "heading":
      return [
        new Paragraph({
          heading: headingLevels[block.tag],
          ...frame(block.align, block.indent + level),
          ...breaking(breakBefore),
          children: toRuns(block.content),
        }),
      ];
    case "quote":
      return [
        new Paragraph({
          style: "manuscriptQuote",
          ...frame(block.align, block.indent + level),
          ...breaking(breakBefore),
          children: toRuns(block.content),
        }),
      ];
    case "list":
      return listParagraphs(block, numbering, level, breakBefore);
  }
}

/**
 * The document body, and the numbering definitions its ordered lists need.
 *
 * **Every beat but the first opens a page**, which is the whole shape of the
 * export. The break rides on the beat's first paragraph rather than on a
 * paragraph of its own, so a beat never starts with a stray empty line — and the
 * first beat carries none, so the document does not open on a blank page.
 */
export function manuscriptParagraphs(beats: ManuscriptBeat[]) {
  const numbering: Numbering = [];
  const children: Paragraph[] = [];

  beats.forEach((beat, index) => {
    // Only the beat's very first paragraph opens the page, whether that turns
    // out to be its heading, its first block, or the placeholder below. The flag
    // is cleared when a paragraph actually takes it, so a block that renders to
    // nothing — an empty list, say — cannot swallow the break.
    let pending = index > 0;

    if (beat.heading !== undefined) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          ...breaking(pending),
          children: [new TextRun({ text: beat.heading })],
        }),
      );
      pending = false;
    }

    let drew = beat.heading !== undefined;
    for (const section of beat.sections)
      for (const block of section.blocks) {
        const made = blockParagraphs(block, numbering, 0, pending);
        if (!made.length) continue;
        children.push(...made);
        pending = false;
        drew = true;
      }

    // A beat whose sections all parsed to nothing still has to hold its page.
    if (!drew) children.push(new Paragraph({ children: [], ...breaking(pending) }));
  });

  return { children, numbering };
}

/**
 * An image as bytes Word can embed, prepared by the caller — the cover for the
 * title page, the author's photo for the author page. Reading a `Blob` and
 * measuring an image both need the browser, so `ManuscriptExportDialog` does it
 * and this module stays pure; `width`/`height` are the image's natural pixels,
 * and only their ratio is used.
 */
export type DocxImage = {
  data: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp";
  width: number;
  height: number;
};

/** The two images a manuscript can carry, each prepared only if its page exists. */
export type DocxImages = { cover?: DocxImage; photo?: DocxImage };

/**
 * The largest the cover is drawn, in the pixels `docx` measures images in (96
 * to the inch): four inches by four and a half, which leaves the title, the
 * subtitle and the byline room on a page with one-inch margins.
 */
const COVER_BOX = { width: 384, height: 432 };

/**
 * The largest the author's photo is drawn: three inches by three and a half,
 * smaller than a cover because the bio below it needs the room.
 */
const PHOTO_BOX = { width: 288, height: 336 };

const margins = { top: INCH, right: INCH, bottom: INCH, left: INCH };

/**
 * An image centred on a line of its own, scaled into `box` by its own
 * proportions and never enlarged. An image that could not be measured is left
 * out rather than drawn at no size.
 */
function imageParagraph(
  image: DocxImage | undefined,
  box: { width: number; height: number },
): Paragraph[] {
  if (!image || image.width <= 0 || image.height <= 0) return [];
  const scale = Math.min(box.width / image.width, box.height / image.height, 1);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [
        new ImageRun({
          type: image.type,
          data: image.data,
          transformation: {
            width: Math.round(image.width * scale),
            height: Math.round(image.height * scale),
          },
        }),
      ],
    }),
  ];
}

/**
 * The title page as a section of its own, centred on the page by the section's
 * `verticalAlign` — Word's own vertical centring, so it holds whatever paper
 * size the reader prints on. Being a section is also what keeps it clear of
 * the running header, and what lets the body restart its page count at 1.
 *
 * A cover that arrives as a web link has no bytes here to embed (the app never
 * fetches one — see the root AGENTS.md), so the page goes without it and the
 * dialog says so before the download.
 */
export function titlePageSection(page: ManuscriptTitlePage, cover?: DocxImage): ISectionOptions {
  const children: Paragraph[] = imageParagraph(cover, COVER_BOX);
  const line = (text: string, run: IRunOptions, after: number) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 276, after },
      children: [new TextRun({ text, ...run })],
    });
  children.push(line(page.title, { size: 52, bold: true }, page.subtitle ? 160 : 480));
  if (page.subtitle) children.push(line(page.subtitle, { size: 32, italics: true }, 480));
  if (page.byline) children.push(line(page.byline, { size: 30 }, 0));
  return {
    properties: {
      page: { margin: margins },
      verticalAlign: VerticalAlignSection.CENTER,
    },
    children,
  };
}

/**
 * A block with no alignment of its own takes the page's centring; one the
 * author aligned keeps it. Lists are left alone — a centred bullet reads as a
 * mistake, not a layout.
 */
const centred = (block: Block): Block =>
  block.kind !== "list" && block.align === "" ? { ...block, align: "center" } : block;

/**
 * The author page: the photo, then the bio, centred on the page both ways by
 * the same `verticalAlign` the title page uses.
 *
 * It is a section for the title page's reasons, and one more: a section that
 * names no header **inherits the previous one's** in Word, so this carries an
 * explicitly empty header, or the running title and page number would print
 * over the author's photo. The bio's ordered lists take numbering definitions
 * from the same `numbering` the body uses, so a list here cannot continue a
 * count from the text.
 */
export function authorPageSection(
  page: ManuscriptAuthorPage,
  numbering: Numbering,
  photo?: DocxImage,
): ISectionOptions {
  return {
    properties: {
      page: { margin: margins },
      verticalAlign: VerticalAlignSection.CENTER,
    },
    headers: { default: new Header({ children: [new Paragraph({ children: [] })] }) },
    children: [
      ...imageParagraph(photo, PHOTO_BOX),
      ...page.blocks.flatMap((block) => blockParagraphs(centred(block), numbering)),
    ],
  };
}

/** The document, ready to pack. Pure — nothing here touches the DOM. */
export function manuscriptDocument(manuscript: Manuscript, images: DocxImages = {}): Document {
  const { children, numbering } = manuscriptParagraphs(manuscript.beats);
  const running = [manuscript.tomeTitle, manuscript.plotName].filter(Boolean).join(" — ");
  const titlePage = manuscript.titlePage;
  // Built before the `Document`, since its lists add to `numbering`.
  const authorPage =
    manuscript.authorPage && authorPageSection(manuscript.authorPage, numbering, images.photo);

  return new Document({
    title: running,
    ...(titlePage?.byline ? { creator: titlePage.byline } : {}),
    description: "Manuscript exported from myTome",
    styles: {
      default: {
        document: {
          run: { font: "Georgia", size: 24 },
          // Matched to the app's own manuscript: 1.75 leading and a blank line
          // between paragraphs rather than a first-line indent, so the export
          // reads as the surface the author wrote on.
          paragraph: { spacing: { line: 420, after: 240 } },
        },
      },
      paragraphStyles: [
        {
          id: "manuscriptQuote",
          name: "Manuscript Quote",
          basedOn: "Normal",
          quickFormat: true,
          run: { italics: true },
          paragraph: { indent: { left: INDENT_STEP } },
        },
      ],
    },
    numbering: { config: numbering },
    sections: [
      ...(titlePage ? [titlePageSection(titlePage, images.cover)] : []),
      {
        properties: {
          page: {
            margin: margins,
            // A title page is unnumbered, so the text starts at page 1 behind it.
            ...(titlePage ? { pageNumbers: { start: 1 } } : {}),
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [
                  new TextRun({ text: `${running}    `, size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
      ...(authorPage ? [authorPage] : []),
    ],
  });
}

/** The `.docx` bytes. The only impure step, and deliberately the last one. */
export const manuscriptDocxBlob = (manuscript: Manuscript, images: DocxImages = {}): Promise<Blob> =>
  Packer.toBlob(manuscriptDocument(manuscript, images));
