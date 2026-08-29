import { liveQuery } from "dexie";
import { db } from "../models/db";
import type { PlotItem, PlotRow } from "../models/Plot";
import {
  applyOrder,
  now,
  plotItemRange,
  plotRowRange,
  uid,
} from "./internal";

/**
 * The tome's shared row axis — the spine — and everything that derives from it.
 *
 * A tome has one ordered list of `PlotRow`s, and every beat of every plot stands
 * on one of them. Two beats on the same row are contemporaneous, which is what
 * lets the grid draw several plots side by side with their beats aligned, and a
 * gap is simply the absence of a cell.
 *
 * **Row order is the truth; `PlotItem.sortOrder` is a cache of it.** This module
 * exists so that rule has a boundary rather than only a comment: every write to
 * a row's rank or to a beat's `plotRowId` happens here, and `syncPlotSortOrder`
 * is the only thing that rewrites `sortOrder` across a tome. `plots.ts` reaches
 * for these rather than numbering beats itself.
 */

/**
 * Grows a tome's spine by `count` rows at the end. Call inside a transaction
 * that includes `db.plotRows`.
 */
export const appendPlotRows = async (tomeId: string, count: number) => {
  const time = now();
  const start = await plotRowRange(tomeId).count();
  const rows: PlotRow[] = Array.from({ length: count }, (_, i) => ({
    id: uid(),
    tomeId,
    sortOrder: start + i,
    createdAt: time,
    updatedAt: time,
  }));
  await db.plotRows.bulkAdd(rows);
  return rows;
};

/**
 * Opens a gap in the spine at `index` and returns the new empty row. Every plot's
 * beats keep the rows they already name, so pushing the tail down moves all of
 * them together and the alignment across plots is preserved.
 */
const insertPlotRowAt = async (tomeId: string, index: number) => {
  const time = now();
  const rows = await plotRowRange(tomeId).toArray();
  const at = Math.min(Math.max(index, 0), rows.length);
  await Promise.all(
    rows
      .slice(at)
      .map((row, i) =>
        db.plotRows.update(row.id, { sortOrder: at + i + 1, updatedAt: time }),
      ),
  );
  const row: PlotRow = {
    id: uid(),
    tomeId,
    sortOrder: at,
    createdAt: time,
    updatedAt: time,
  };
  await db.plotRows.add(row);
  return row;
};

/**
 * The spine row a new beat should take. A beat inserted between two others opens
 * a fresh row just above the one it displaces; a beat appended to the end reuses
 * the next row this plot leaves empty and only grows the spine when there is
 * none — so writing straight down a single plot does not strand its beats below
 * everyone else's. Call inside a transaction covering `db.plotRows` and
 * `db.plotItems`.
 */
export const rowForNewPlotItem = async (tomeId: string, plotId: string, at: number) => {
  const rows = await plotRowRange(tomeId).toArray();
  const siblings = await plotItemRange(plotId).toArray();
  if (at < siblings.length) {
    const displaced = rows.findIndex((row) => row.id === siblings[at].plotRowId);
    return insertPlotRowAt(tomeId, displaced < 0 ? rows.length : displaced);
  }
  const held = new Set(siblings.map((item) => item.plotRowId));
  const lastHeld = rows.reduce((last, row, i) => (held.has(row.id) ? i : last), -1);
  // Everything past the plot's last beat is free by definition, so the next row
  // is either there for the taking or the spine has run out.
  return rows[lastHeld + 1] ?? (await appendPlotRows(tomeId, 1))[0];
};

/**
 * Rewrites every beat's `sortOrder` in a tome from the order of the rows they
 * stand on, which is the truth — `sortOrder` is a cache of it, kept so that the
 * `[plotId+sortOrder]` index and every single-plot reader keep working unchanged.
 *
 * End every mutation that touches rows or row assignments with this, inside its
 * transaction. It writes only the rows that actually move, so calling it after a
 * change that reordered nothing costs one read and fires no live query.
 */
export const syncPlotSortOrder = async (tomeId: string) => {
  const rows = await plotRowRange(tomeId).toArray();
  const rank = new Map(rows.map((row, index) => [row.id, index]));
  const byPlot = new Map<string, PlotItem[]>();
  for (const item of await db.plotItems.where("tomeId").equals(tomeId).toArray())
    byPlot.set(item.plotId, [...(byPlot.get(item.plotId) ?? []), item]);
  const writes: Promise<number>[] = [];
  for (const list of byPlot.values()) {
    // A beat whose row somehow went missing sinks to the end rather than
    // silently claiming the top of its plot.
    list.sort(
      (a, b) =>
        (rank.get(a.plotRowId) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.plotRowId) ?? Number.MAX_SAFE_INTEGER),
    );
    list.forEach((item, index) => {
      if (item.sortOrder !== index)
        writes.push(db.plotItems.update(item.id, { sortOrder: index }));
    });
  }
  await Promise.all(writes);
};

export const spineStore = {
  /** The tome's shared spine, in order — the row axis every plot is drawn against. */
  observePlotRows(tomeId: string, callback: (v: PlotRow[]) => void) {
    return liveQuery(() => plotRowRange(tomeId).toArray()).subscribe({
      next: callback,
      error: console.error,
    });
  },
  /**
   * Opens an empty row at `index`, pushing the rest of the spine down. Every beat
   * keeps the row it already names, so all of them shift together and nothing
   * loses the beat it was aligned against.
   */
  async insertPlotRow(tomeId: string, index: number) {
    return db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const row = await insertPlotRowAt(tomeId, index);
      await syncPlotSortOrder(tomeId);
      return row;
    });
  },
  /** Names a row, or clears the name when given blank text. */
  async setPlotRowLabel(rowId: string, label: string) {
    await db.plotRows.update(rowId, {
      label: label.trim() || undefined,
      updatedAt: now(),
    });
  },
  /**
   * What a row is holding, across every plot in the tome. `deletePlotRow` takes
   * all of it, so the confirm dialog asks with these numbers in hand.
   */
  async countPlotRowBeats(rowId: string) {
    const items = await db.plotItems.where("plotRowId").equals(rowId).toArray();
    return { beats: items.length, plots: new Set(items.map((item) => item.plotId)).size };
  },
  /**
   * Deletes a row and every beat standing on it. Unlike the rest of the plot
   * mutations this reaches across plots, which is why it is destructive enough to
   * confirm first — see `countPlotRowBeats`.
   */
  async deletePlotRow(row: Pick<PlotRow, "id" | "tomeId">) {
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      await db.plotItems.where("plotRowId").equals(row.id).delete();
      await db.plotRows.delete(row.id);
      await applyOrder(db.plotRows, await plotRowRange(row.tomeId).primaryKeys());
      await syncPlotSortOrder(row.tomeId);
    });
  },
  async reorderPlotRows(tomeId: string, orderedIds: string[]) {
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const stored = await plotRowRange(tomeId).primaryKeys();
      // The same stale-drag guard `reorderPlotItems` uses: another tab changed the
      // spine mid-drag, so this order is about a set that no longer exists.
      if (
        stored.length !== orderedIds.length ||
        !stored.every((id) => orderedIds.includes(id))
      )
        return;
      await applyOrder(db.plotRows, orderedIds);
      await syncPlotSortOrder(tomeId);
    });
  },
  /**
   * Moves a beat onto another row of its tome's spine — the compare grid's drop.
   * Landing on a row that already holds one of the same plot's beats swaps the
   * two: a plot can only have one beat per row, because a grid cell can only draw
   * one card.
   */
  async movePlotItemToRow(itemId: string, plotRowId: string) {
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const item = await db.plotItems.get(itemId);
      const row = await db.plotRows.get(plotRowId);
      // A stale drop: the beat or the row went away in another tab, or the drag
      // ended where it started.
      if (!item || !row || row.tomeId !== item.tomeId || item.plotRowId === plotRowId)
        return;
      const time = now();
      const displaced = await db.plotItems
        .where("plotRowId")
        .equals(plotRowId)
        .filter((other) => other.plotId === item.plotId)
        .first();
      if (displaced)
        await db.plotItems.update(displaced.id, {
          plotRowId: item.plotRowId,
          updatedAt: time,
        });
      await db.plotItems.update(itemId, { plotRowId, updatedAt: time });
      await syncPlotSortOrder(item.tomeId);
    });
  },
  /**
   * Drops every row no plot has a beat on, and reports how many went. The spine
   * only ever grows as beats are inserted, and deleting a beat leaves its row
   * standing, so this is the housekeeping that keeps a long tome's grid from
   * filling up with dead slots.
   */
  async removeEmptyPlotRows(tomeId: string) {
    return db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const rows = await plotRowRange(tomeId).toArray();
      const held = new Set(
        (await db.plotItems.where("tomeId").equals(tomeId).toArray()).map(
          (item) => item.plotRowId,
        ),
      );
      const empty = rows.filter((row) => !held.has(row.id));
      if (!empty.length) return 0;
      await db.plotRows.bulkDelete(empty.map((row) => row.id));
      await applyOrder(
        db.plotRows,
        rows.filter((row) => held.has(row.id)).map((row) => row.id),
      );
      await syncPlotSortOrder(tomeId);
      return empty.length;
    });
  },
};
