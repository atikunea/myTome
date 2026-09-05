import type { Plot, PlotItem } from "../models/Plot";
import type { WriteItem } from "../models/WriteItem";
import { untitledWriteItem } from "../models/WriteItem";

/**
 * How the Write list orders a tome's prose, decided here and rendered by
 * `pages/WriteListPage.tsx`.
 *
 * Pulled out of the page for the reason `hooks/autosave.ts` and
 * `lexical/blocks.ts` were: it is only data and comparisons, so it can be driven
 * from the suite's `node` environment, while the page keeps a `useMemo` and a
 * `<select>`. It reads no table — it takes rows the page already observes — so
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

export type WriteSort = "recent" | "story" | "alpha";

/**
 * The Write list's visible rows: filtered by type, then ordered.
 *
 * Story order falls back to recency rather than to nothing, because every
 * uncomposed item shares the one sentinel key and would otherwise come out in
 * whatever order the query happened to return.
 */
export function sortWriteItems({
  items,
  typeFilter,
  sort,
  keys,
}: {
  items: WriteItem[];
  typeFilter: WriteItem["type"] | "all";
  sort: WriteSort;
  keys: Map<string, StoryKey>;
}) {
  const byRecency = (a: WriteItem, b: WriteItem) =>
    b.updatedAt.localeCompare(a.updatedAt);
  return items
    .filter((item) => typeFilter === "all" || item.type === typeFilter)
    .sort((a, b) => {
      if (sort === "alpha")
        return (a.title || untitledWriteItem).localeCompare(
          b.title || untitledWriteItem,
        );
      if (sort === "story")
        return (
          compareStoryKeys(keys.get(a.id) ?? uncomposed, keys.get(b.id) ?? uncomposed) ||
          byRecency(a, b)
        );
      return byRecency(a, b);
    });
}
