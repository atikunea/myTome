import type { Author } from "../models/Author";
import { authorByline } from "../models/Author";
import type { Plot, PlotItem } from "../models/Plot";
import type { ImageSource, Tome } from "../models/Tome";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import { untitledWriteItem } from "../models/WriteItem";
import type { Block } from "../lexical/blocks";
import { blocksText, countWords, lexicalToBlocks } from "../lexical/blocks";
// `slug.ts` is pure and table-free, so this module still reads no table.
import { slugify } from "./slug";

/**
 * What a plot line's manuscript *is*, decided here and rendered elsewhere.
 *
 * This module is the export's `syncPlan.ts`: it decides, and `manuscriptDocx.ts`
 * and `ManuscriptPrint.tsx` move. It holds no React, no DOM and no format —
 * only ordering, filtering and the reasons things were left out — so the whole
 * of the decision is driven from the suite's `node` environment, the same split
 * `hooks/autosave.ts` and `lexical/blocks.ts` already make.
 *
 * **A manuscript is one plot line, and that is a deliberate limit.** A tome's
 * beats stand on a shared spine where two beats on the same row are
 * *contemporaneous* — which is precisely the absence of a reading order — so
 * there is no honest way to interleave several plots into one document without
 * either guessing or inventing a second ordering axis. One column of the grid,
 * read top to bottom, is already a total order with no ties, and that is what a
 * manuscript is. If a tome's whole book needs exporting, the book is a plot.
 */

export type ManuscriptOptions = {
  /** Which kinds of prose belong in the manuscript. Empty means nothing does. */
  types: WriteItemType[];
  /** Whether each beat opens with its title as a heading. */
  beatHeadings: boolean;
  /** Whether the document opens on a title page — see `ManuscriptTitlePage`. */
  titlePage: boolean;
  /** Whether the document ends on an author page — see `ManuscriptAuthorPage`. */
  authorPage: boolean;
};

export const defaultManuscriptOptions: ManuscriptOptions = {
  // Lore is background material and a snippet is scratch; neither is the book.
  types: ["passage", "chapter"],
  beatHeadings: true,
  titlePage: true,
  authorPage: true,
};

export type ManuscriptSection = {
  writeItemId: string;
  title: string;
  type: WriteItemType;
  blocks: Block[];
  words: number;
};

/**
 * One beat's contribution. Each begins on a fresh page — that is the whole
 * reason the manuscript is grouped by beat rather than flattened to sections —
 * but the sections *within* a beat flow continuously, because their order is
 * the order the prose is read in and nothing separates them but the author's
 * paragraphing.
 */
export type ManuscriptBeat = {
  beatId: string;
  /** `PlotItem.title` — the beat's title. Present only when `beatHeadings` is on. */
  heading?: string;
  sections: ManuscriptSection[];
  words: number;
};

/**
 * Why something an author might expect to see is not in the document. Nothing
 * is dropped silently: a manuscript is the last place to guess quietly, so
 * every omission is reported and the dialog counts them before the download.
 */
export type ManuscriptSkip =
  | { reason: "empty"; beatId: string; beatName: string }
  | { reason: "type"; writeItemId: string; title: string; type: WriteItemType }
  | { reason: "missing"; writeItemId: string; beatName: string };

/**
 * A text composed into more than one beat of this plot, and therefore printed
 * once per beat. **This is not a skip** — nothing was left out, and the word
 * count includes every appearance. It is reported by name because composing the
 * same passage twice is as often a mistake as an intention, and only the author
 * can tell which; naming the beats is what lets them go and look.
 */
export type ManuscriptRepeat = {
  writeItemId: string;
  title: string;
  /** The beats it appears in, in reading order. Always two or more. */
  beatNames: string[];
};

/**
 * The page a manuscript opens on: the book's cover, title, subtitle and byline,
 * centred on the page both ways, and nothing else on it.
 *
 * Only what is actually there is carried — a blank subtitle, an uncredited tome
 * or a book with no cover simply has no entry, so neither writer has to decide
 * whether an empty string deserves a line. The byline is the credited profile's
 * pen name, or the author's own name when they have none: that is what a title
 * page says, and `authorByline` is the one place the rule lives.
 *
 * It is a page of its own rather than a heading on the first beat, so it is
 * never counted as a beat and adds nothing to the word count.
 */
export type ManuscriptTitlePage = {
  title: string;
  subtitle?: string;
  byline?: string;
  cover?: ImageSource;
};

/**
 * The page a manuscript ends on: the credited author's photo with their bio
 * below it, centred on the page both ways — the book's "about the author".
 *
 * It exists only when there is something to put on it. An uncredited tome, or
 * a profile with neither a photo nor a word of bio, gets no page at all rather
 * than a blank one; the dialog says which, so the author knows where to go.
 * A bio that is only whitespace counts as none, and is carried as no blocks so
 * a writer never draws an empty paragraph under the photo.
 *
 * Like the title page it is not a beat and adds nothing to the word count: it
 * is back matter, not the book.
 */
export type ManuscriptAuthorPage = {
  photo?: ImageSource;
  blocks: Block[];
};

export type Manuscript = {
  tomeTitle: string;
  plotName: string;
  /** Present only when `options.titlePage` asked for one. */
  titlePage?: ManuscriptTitlePage;
  /**
   * Present only when `options.authorPage` asked for one *and* the credited
   * profile has a photo or a bio to fill it.
   */
  authorPage?: ManuscriptAuthorPage;
  beats: ManuscriptBeat[];
  words: number;
  repeated: ManuscriptRepeat[];
  skipped: ManuscriptSkip[];
};

/** What to show when the author never named the beat. */
const untitledBeat = "Untitled beat";

const beatName = (beat: PlotItem) => beat.name.trim() || untitledBeat;
/**
 * What a beat's heading says. `title` is the beat's required name and so is
 * what belongs at the head of a page; `name` — the short label beside the
 * track, "Chapter 1" — stands in only for a beat that somehow reached the
 * export without a title, which beats printing "Untitled beat" over a page the
 * author did label.
 */
const beatTitle = (beat: PlotItem) =>
  beat.title.trim() || beat.name.trim() || untitledBeat;
const itemTitle = (item: WriteItem) => item.title.trim() || untitledWriteItem;

/**
 * Flattens a plot line into the document it would print as.
 *
 * Beats come in `sortOrder` — which the spine keeps as a cache of row rank — and
 * each beat's `writeItemIds` in its authored reading order. The sort is redone
 * here rather than trusted from the caller so the function is total: it is the
 * one description of what the export contains, and a test should not have to
 * reproduce a range query to drive it.
 *
 * A text composed into several beats is printed **in every one of them**, and
 * its words counted every time. The composition is what the author authored, and
 * silently thinning it would make the exported manuscript disagree with the beat
 * manuscripts they wrote it on. The repeats are named in `repeated` instead, so
 * an accidental double-compose is visible without being decided for them.
 */
export function buildManuscript({
  tome,
  author,
  plot,
  beats,
  writeItems,
  options,
}: {
  tome: Pick<Tome, "title" | "subtitle" | "coverImage">;
  /** The profile the tome credits, if it credits one that still exists. */
  author?: Pick<Author, "name" | "pseudonym"> & Partial<Pick<Author, "description" | "image">>;
  plot: Pick<Plot, "id" | "name">;
  beats: PlotItem[];
  writeItems: WriteItem[];
  options: ManuscriptOptions;
}): Manuscript {
  const byId = new Map(writeItems.map((item) => [item.id, item]));
  const wanted = new Set(options.types);
  const skipped: ManuscriptSkip[] = [];
  // Where each included text ended up, so the ones landing in several beats can
  // be named afterwards. Insertion order is reading order, which is the order
  // the author will want to go looking in.
  const appearances = new Map<string, { title: string; beatNames: string[] }>();

  const ordered = beats
    .filter((beat) => beat.plotId === plot.id)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const built: ManuscriptBeat[] = [];

  for (const beat of ordered) {
    const name = beatName(beat);
    const sections: ManuscriptSection[] = [];

    for (const id of beat.writeItemIds ?? []) {
      const item = byId.get(id);
      // `detachWriteItem` keeps these arrays clean, so a dangling id means a
      // database that missed something. Say so rather than rendering a hole.
      if (!item) {
        skipped.push({ reason: "missing", writeItemId: id, beatName: name });
        continue;
      }
      if (!wanted.has(item.type)) {
        skipped.push({
          reason: "type",
          writeItemId: id,
          title: itemTitle(item),
          type: item.type,
        });
        continue;
      }
      const seen = appearances.get(id);
      if (seen) seen.beatNames.push(name);
      else appearances.set(id, { title: itemTitle(item), beatNames: [name] });

      const blocks = lexicalToBlocks(item.content);
      sections.push({
        writeItemId: id,
        title: itemTitle(item),
        type: item.type,
        blocks,
        words: countWords(blocksText(blocks)),
      });
    }

    // A beat contributing nothing would otherwise print as a blank page.
    if (!sections.length) {
      skipped.push({ reason: "empty", beatId: beat.id, beatName: name });
      continue;
    }

    built.push({
      beatId: beat.id,
      ...(options.beatHeadings ? { heading: beatTitle(beat) } : {}),
      sections,
      words: sections.reduce((total, section) => total + section.words, 0),
    });
  }

  const repeated: ManuscriptRepeat[] = [];
  for (const [writeItemId, seen] of appearances)
    if (seen.beatNames.length > 1)
      repeated.push({ writeItemId, title: seen.title, beatNames: seen.beatNames });

  const subtitle = tome.subtitle?.trim();
  const byline = author && authorByline(author);
  const bioBlocks = author?.description ? lexicalToBlocks(author.description) : [];
  const bio = blocksText(bioBlocks).trim() ? bioBlocks : [];
  const authorPage: ManuscriptAuthorPage | undefined =
    options.authorPage && author && (author.image || bio.length)
      ? { ...(author.image ? { photo: author.image } : {}), blocks: bio }
      : undefined;
  return {
    tomeTitle: tome.title,
    plotName: plot.name,
    ...(options.titlePage
      ? {
          titlePage: {
            title: tome.title.trim(),
            ...(subtitle ? { subtitle } : {}),
            ...(byline ? { byline } : {}),
            ...(tome.coverImage ? { cover: tome.coverImage } : {}),
          },
        }
      : {}),
    ...(authorPage ? { authorPage } : {}),
    beats: built,
    words: built.reduce((total, beat) => total + beat.words, 0),
    repeated,
    skipped,
  };
}

/** Counts of each kind of omission, which is all the dialog needs to report. */
export function summarizeSkips(skipped: ManuscriptSkip[]) {
  return {
    empty: skipped.filter((skip) => skip.reason === "empty").length,
    type: skipped.filter((skip) => skip.reason === "type").length,
    missing: skipped.filter((skip) => skip.reason === "missing").length,
  };
}

/**
 * `myTome-the-long-road-main-plot-2026-09-05.docx` — the name the download
 * lands under, shaped like `backupFileName` so the two files sort together in a
 * folder full of an author's exports.
 */
export function manuscriptFileName(
  manuscript: Pick<Manuscript, "tomeTitle" | "plotName">,
  extension: string,
  today = new Date(),
) {
  const parts = [
    slugify(manuscript.tomeTitle),
    slugify(manuscript.plotName),
  ].filter(Boolean);
  return `myTome-${parts.join("-") || "manuscript"}-${today
    .toISOString()
    .slice(0, 10)}.${extension}`;
}
