import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { untitledWriteItem, writeItemTypes } from "../models/WriteItem";

/**
 * What the Write list shows and how it orders it, decided here and rendered by
 * `pages/WriteListPage.tsx`.
 *
 * Pulled out of the page for the reason `hooks/autosave.ts` and
 * `lexical/blocks.ts` were: it is only data and comparisons, so it can be driven
 * from the suite's `node` environment, while the page keeps a `useMemo` and a
 * table header. It reads no table — it takes rows the page already observes — so
 * it sits beside `manuscript.ts` rather than on `store`.
 *
 * **"Story order" here is plot-major concatenation, and that is not a book.**
 * Two beats on the same spine row are contemporaneous, so a tome has no single
 * reading order across its plots; the plot's own `sortOrder` breaks the tie
 * because a grouped list is what this sort is for. A manuscript is one plot
 * line — see `services/manuscript.ts` — and this must not be mistaken for the
 * missing multi-plot exporter.
 */

/** (plot position, beat position, position within that beat). */
export type StoryKey = [number, number, number];

/** Sorts after every real story key, parking uncomposed items at the end. */
export const uncomposed: StoryKey = [Infinity, Infinity, Infinity];

export const compareStoryKeys = (a: StoryKey, b: StoryKey) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Where each write item sits in the manuscript: its earliest composing beat. An
 * item composed into several beats takes the first of them, so a passage reused
 * later in the book still sorts where it is first read.
 */
export function storyKeys(plots: Plot[], beats: PlotItem[]) {
  const plotOrder = new Map(plots.map((plot) => [plot.id, plot.sortOrder]));
  const keys = new Map<string, StoryKey>();
  for (const beat of beats)
    (beat.writeItemIds ?? []).forEach((id, index) => {
      const key: StoryKey = [
        // A beat whose plot is not in the list sorts to the end rather than to
        // the top, the same way a beat with no row does on the spine.
        plotOrder.get(beat.plotId) ?? Infinity,
        beat.sortOrder,
        index,
      ];
      const current = keys.get(id);
      if (!current || compareStoryKeys(key, current) < 0) keys.set(id, key);
    });
  return keys;
}

/** What a beat the author never named shows as. Matches `manuscript.ts`. */
const untitledBeat = "Untitled beat";

/**
 * A beat's heading, by the same rule the manuscript export uses: `title` is
 * what belongs at the head of a page, and `name` — the short label beside the
 * track — is the fallback, so a beat labelled but never titled is still named
 * rather than reading "Untitled beat".
 */
const beatHeading = (beat: PlotItem) =>
  beat.title.trim() || beat.name.trim() || untitledBeat;

/** One place a text is composed into — a cell of the list's "Used in" column. */
export interface WriteItemUse {
  plotId: string;
  plotName: string;
  beatId: string;
  beatTitle: string;
}

/**
 * Every beat composing each text, in reading order.
 *
 * The list shows this rather than a bare count because "which chapter is this
 * in?" is the question a grid of title-only cards could never answer. A text
 * composed into several beats gets several entries — that reuse is the model
 * working as designed (see `src/components/AGENTS.md`), so it is reported in
 * full and never thinned to the first one.
 */
export function writeItemUses(plots: Plot[], beats: PlotItem[]) {
  const byId = new Map(plots.map((plot) => [plot.id, plot]));
  const found = new Map<string, { key: StoryKey; use: WriteItemUse }[]>();
  for (const beat of beats)
    (beat.writeItemIds ?? []).forEach((id, index) => {
      const plot = byId.get(beat.plotId);
      // A beat whose plot has gone contributes nothing nameable, and naming a
      // plot that is not there would be worse than saying nothing.
      if (!plot) return;
      const entry = {
        key: [plot.sortOrder, beat.sortOrder, index] as StoryKey,
        use: {
          plotId: plot.id,
          plotName: plot.name,
          beatId: beat.id,
          beatTitle: beatHeading(beat),
        },
      };
      found.set(id, [...(found.get(id) ?? []), entry]);
    });
  return new Map(
    [...found].map(([id, entries]) => [
      id,
      entries.sort((a, b) => compareStoryKeys(a.key, b.key)).map((entry) => entry.use),
    ]),
  );
}

/** The list's sortable columns, named for what each one sorts by. */
export type WriteSort = "type" | "alpha" | "story" | "recent" | "words";

export type SortDirection = "asc" | "desc";

/**
 * Which way a column sorts the first time it is clicked — the reading each is
 * usually wanted in, so the common case costs one click rather than two. Dates
 * and word counts open at their largest, names at their first letter.
 */
export const defaultDirection: Record<WriteSort, SortDirection> = {
  type: "asc",
  alpha: "asc",
  story: "asc",
  recent: "desc",
  words: "desc",
};

/** What the row actually shows, which is what alphabetical has to sort by. */
const displayTitle = (item: WriteItem) => item.title.trim() || untitledWriteItem;

/** Newest first — the tiebreak under every column, and a column of its own. */
const byRecency = (a: WriteItem, b: WriteItem) =>
  b.updatedAt.localeCompare(a.updatedAt);

/** Ascending by definition; `direction` flips the result, not these. */
const ascending: Record<WriteSort, (a: WriteItem, b: WriteItem) => number> = {
  // The four types are a closed union with an authored order (snippet, lore,
  // passage, chapter), which is rather more useful than their alphabet.
  type: (a, b) => writeItemTypes.indexOf(a.type) - writeItemTypes.indexOf(b.type),
  alpha: (a, b) => displayTitle(a).localeCompare(displayTitle(b)),
  // Story order needs the keys, which are a caller's argument rather than a
  // property of the two rows, so `sortWriteItems` supplies this one itself.
  story: () => 0,
  recent: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
  words: (a, b) => a.wordCount - b.wordCount,
};

/**
 * The Write list's visible rows: filtered by search text and type, then ordered.
 *
 * The tiebreak is recency under every column and in both directions —
 * deliberately *not* flipped with the sort. Reversing "The salt road" against
 * "The sea gate" is what the author asked for; reversing which of two
 * identically titled drafts comes first is only noise.
 *
 * Story order falls back to that same tiebreak rather than to nothing, because
 * every uncomposed item shares the one sentinel key and would otherwise come out
 * in whatever order the query happened to return.
 */
export function sortWriteItems({
  items,
  typeFilter,
  query = "",
  sort,
  direction = defaultDirection[sort],
  keys,
}: {
  items: WriteItem[];
  typeFilter: WriteItem["type"] | "all";
  /** Matched against title and stored preview, the way the picker matches. */
  query?: string;
  sort: WriteSort;
  direction?: SortDirection;
  keys: Map<string, StoryKey>;
}) {
  const needle = query.trim().toLowerCase();
  const sign = direction === "asc" ? 1 : -1;
  const primary =
    sort === "story"
      ? (a: WriteItem, b: WriteItem) =>
          compareStoryKeys(
            keys.get(a.id) ?? uncomposed,
            keys.get(b.id) ?? uncomposed,
          )
      : ascending[sort];
  return items
    .filter((item) => typeFilter === "all" || item.type === typeFilter)
    .filter(
      (item) =>
        !needle ||
        item.title.toLowerCase().includes(needle) ||
        item.preview.toLowerCase().includes(needle),
    )
    .sort((a, b) => sign * primary(a, b) || byRecency(a, b));
}
