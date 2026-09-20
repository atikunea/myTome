import { expect } from "vitest";
import { db } from "../../models/db";
import type { PlotItem } from "../../models/Plot";
import { store } from "../store";

/** A tome with `plots` named plots, ready for beats. */
/**
 * Pushes every row a tome owns into the past.
 *
 * `touchedAt` is a max over `updatedAt` across all of these tables, and two
 * writes landing in the same millisecond share a timestamp. So a test that
 * sets a tome up, writes again, and expects the mark to have *moved* is a coin
 * flip — it passes on a slow machine and fails on a fast one, which is exactly
 * the flake `AGENTS.md` warns about under "Never assert an order that
 * `updatedAt` alone decides".
 *
 * Backdating the earlier side makes the comparison mean what it says. The
 * table list is the one in `highWaterMark` (`backup.ts`); a new tome-owned
 * table with an `updatedAt` belongs in both.
 */
export const backdateTome = async (tomeId: string, at = "2001-01-01T00:00:00.000Z") => {
  const tome = await db.tomes.get(tomeId);
  if (tome) await db.tomes.put({ ...tome, updatedAt: at });

  const owned = [
    "elementTypes",
    "elements",
    "relationships",
    "plots",
    "plotRows",
    "plotItems",
    "writeItems",
    "writingDays",
  ];

  const tables = db.tables.filter((table) => owned.includes(table.name));
  // A renamed or dropped table would otherwise be skipped in silence, and the
  // backdating would be quietly partial — which is the same flake again,
  // wearing a helper's clothes.
  expect(tables.map((table) => table.name).sort()).toEqual([...owned].sort());

  for (const table of tables) {
    await table.where("tomeId").equals(tomeId).modify({ updatedAt: at });
  }
};

export const makeTome = async (plotNames: string[] = []) => {
  const tome = await store.saveTome({
    title: "Test Tome",
    description: "",
    status: "Draft",
  });
  const plots = [];
  for (const name of plotNames) plots.push(await store.savePlot({ tomeId: tome.id, name }));
  return { tome, plots };
};

/** Appends a beat to the end of a plot, the way writing straight down one does. */
export const addBeat = (tomeId: string, plotId: string, title: string, insertAt?: number) =>
  store.savePlotItem(
    { tomeId, plotId, name: "", title, description: "" },
    insertAt,
  );

/** The tome's spine, in order. */
export const rowIds = async (tomeId: string) =>
  (await db.plotRows.where("tomeId").equals(tomeId).sortBy("sortOrder")).map((r) => r.id);

/** One plot's beats in stored order, as `[plotId+sortOrder]` yields them. */
export const beatsOf = (plotId: string) =>
  db.plotItems.where("plotId").equals(plotId).sortBy("sortOrder");

/**
 * A plot's beat titles laid out against the tome's spine — one entry per row,
 * `null` where the plot has a gap. This is what the grid draws, so it is
 * the shape alignment assertions should be written in.
 */
export const columnOf = async (tomeId: string, plotId: string) => {
  const rows = await rowIds(tomeId);
  const byRow = new Map(
    (await beatsOf(plotId)).map((item) => [item.plotRowId, item.title]),
  );
  return rows.map((id) => byRow.get(id) ?? null);
};

/**
 * The spine contract, as one assertion: `PlotItem.sortOrder` is a cache of row
 * order, and a plot holds at most one beat per row.
 *
 * Call this after *every* mutation that could touch rows or row assignments —
 * it is the single predicate that covers `savePlotItem`, `reorderPlotItems`,
 * `deletePlotItem`, `insertPlotRow`, `deletePlotRow`, `reorderPlotRows`,
 * `movePlotItemToRow` and `removeEmptyPlotRows` at once.
 */
export const expectSpineIntact = async (tomeId: string) => {
  const rows = await rowIds(tomeId);
  const rank = new Map(rows.map((id, index) => [id, index]));
  const byPlot = new Map<string, PlotItem[]>();
  for (const item of await db.plotItems.where("tomeId").equals(tomeId).toArray())
    byPlot.set(item.plotId, [...(byPlot.get(item.plotId) ?? []), item]);

  for (const [plotId, items] of byPlot) {
    const where = (what: string) => `${what} (plot ${plotId})`;

    // Every beat stands on a row of this tome's spine.
    for (const item of items)
      expect(rank.get(item.plotRowId), where(`beat "${item.title}" names a live row`))
        .toBeTypeOf("number");

    // At most one beat per row: a grid cell can only draw one card.
    const occupied = items.map((item) => item.plotRowId);
    expect(new Set(occupied).size, where("one beat per row")).toBe(occupied.length);

    // sortOrder is exactly the rank of the row, compacted from 0.
    const byRowRank = [...items].sort(
      (a, b) => rank.get(a.plotRowId)! - rank.get(b.plotRowId)!,
    );
    expect(
      byRowRank.map((item) => item.sortOrder),
      where("sortOrder follows row order, compacted from 0"),
    ).toEqual(byRowRank.map((_, index) => index));
  }

  // The spine itself is compacted too.
  const stored = await db.plotRows.where("tomeId").equals(tomeId).sortBy("sortOrder");
  expect(stored.map((row) => row.sortOrder)).toEqual(stored.map((_, index) => index));
};
