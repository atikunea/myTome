import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { store } from "../store";
import { addBeat, expectSpineIntact, makeTome } from "./helpers";

/**
 * The plot row itself, as distinct from its beats: naming, ordering and the
 * default. Everything about *beats* is in `spine.test.ts`, where the ordering
 * contract lives.
 */

describe("savePlot", () => {
  it("trims the name and drops a description that was only whitespace", async () => {
    const { tome } = await makeTome();

    const plot = await store.savePlot({
      tomeId: tome.id,
      name: "  Main Plot  ",
      description: "   ",
    });

    expect(plot.name).toBe("Main Plot");
    expect(plot.description).toBeUndefined();
  });

  it("appends each new plot to the end of the tome's list", async () => {
    const { tome } = await makeTome();

    const a = await store.savePlot({ tomeId: tome.id, name: "A" });
    const b = await store.savePlot({ tomeId: tome.id, name: "B" });

    expect([a.sortOrder, b.sortOrder]).toEqual([0, 1]);
  });

  it("keeps a plot's position and created time across a rename", async () => {
    const { plots } = await makeTome(["A", "B"]);

    const renamed = await store.savePlot({ ...plots[1], name: "Subplot" });

    expect(renamed.sortOrder).toBe(1);
    expect(renamed.createdAt).toBe(plots[1].createdAt);
    expect(await db.plots.count()).toBe(2);
  });

  it("refuses a blank name without writing a row", async () => {
    const { tome } = await makeTome();

    await expect(store.savePlot({ tomeId: tome.id, name: "   " })).rejects.toThrow(
      /plot name is required/,
    );
    expect(await db.plots.count()).toBe(0);
  });

  it("numbers plots per tome, not globally", async () => {
    const first = await makeTome(["A", "B"]);
    const second = await makeTome(["C"]);

    expect(second.plots[0].sortOrder).toBe(0);
    expect(first.plots.map((plot) => plot.sortOrder)).toEqual([0, 1]);
  });
});

describe("ensureDefaultPlot", () => {
  it("creates a first plot for a tome that has none", async () => {
    const { tome } = await makeTome();

    const plot = await store.ensureDefaultPlot(tome.id);

    expect(plot.name).toBe("Main Plot");
    expect(await db.plots.where("tomeId").equals(tome.id).count()).toBe(1);
  });

  it("hands back the existing first plot rather than adding another", async () => {
    const { tome, plots } = await makeTome(["Already Here"]);

    const plot = await store.ensureDefaultPlot(tome.id);

    expect(plot.id).toBe(plots[0].id);
    expect(await db.plots.where("tomeId").equals(tome.id).count()).toBe(1);
  });
});

describe("reorderPlots", () => {
  it("renumbers the plots into the order given", async () => {
    const { tome, plots } = await makeTome(["A", "B", "C"]);

    await store.reorderPlots(tome.id, [plots[2].id, plots[0].id, plots[1].id]);

    const ordered = await db.plots.where("tomeId").equals(tome.id).sortBy("sortOrder");
    expect(ordered.map((plot) => plot.name)).toEqual(["C", "A", "B"]);
    expect(ordered.map((plot) => plot.sortOrder)).toEqual([0, 1, 2]);
  });

  it("drops a stale drag whose plot set no longer matches", async () => {
    const { tome, plots } = await makeTome(["A", "B", "C"]);
    // Another tab deleted C while this drag was in flight.
    await store.deletePlot(plots[2]);

    await store.reorderPlots(tome.id, [plots[2].id, plots[0].id, plots[1].id]);

    const ordered = await db.plots.where("tomeId").equals(tome.id).sortBy("sortOrder");
    expect(ordered.map((plot) => plot.name)).toEqual(["A", "B"]);
  });

  it("leaves another tome's plots untouched", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    const other = await makeTome(["X", "Y"]);

    await store.reorderPlots(tome.id, [plots[1].id, plots[0].id]);

    const theirs = await db.plots.where("tomeId").equals(other.tome.id).sortBy("sortOrder");
    expect(theirs.map((plot) => plot.name)).toEqual(["X", "Y"]);
  });
});

describe("deletePlot", () => {
  it("compacts the plots left behind and leaves the tome's spine standing", async () => {
    const { tome, plots } = await makeTome(["A", "B", "C"]);
    await addBeat(tome.id, plots[0].id, "a1");
    await addBeat(tome.id, plots[1].id, "b1");
    const rowsBefore = await db.plotRows.where("tomeId").equals(tome.id).count();

    await store.deletePlot(plots[1]);

    const ordered = await db.plots.where("tomeId").equals(tome.id).sortBy("sortOrder");
    expect(ordered.map((plot) => plot.name)).toEqual(["A", "C"]);
    expect(ordered.map((plot) => plot.sortOrder)).toEqual([0, 1]);
    // Deleting a plot is not a reason to renumber the shared axis: the rows are
    // the tome's, and the other plots are still standing on them.
    expect(await db.plotRows.where("tomeId").equals(tome.id).count()).toBe(rowsBefore);
    await expectSpineIntact(tome.id);
  });
});
