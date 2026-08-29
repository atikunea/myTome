import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { store } from "../store";
import {
  addBeat,
  beatsOf,
  columnOf,
  expectSpineIntact,
  makeTome,
  rowIds,
} from "./helpers";

/**
 * The spine contract from AGENTS.md, exercised. `expectSpineIntact` is asserted
 * after every mutation here — it is the predicate that says `sortOrder` is a
 * cache of row order and that a plot holds at most one beat per row.
 */
describe("the spine: sortOrder derives from row order", () => {
  it("appends straight down one plot without stranding beats", async () => {
    const { tome, plots } = await makeTome(["A"]);
    for (const title of ["one", "two", "three"])
      await addBeat(tome.id, plots[0].id, title);

    await expectSpineIntact(tome.id);
    // Writing down a single plot grows the spine exactly as far as it needs.
    expect(await rowIds(tome.id)).toHaveLength(3);
    expect(await columnOf(tome.id, plots[0].id)).toEqual(["one", "two", "three"]);
  });

  it("numbers a beat inserted into a gap by its row, not its insert index", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    // B is written first and deeper, so A's beats sit on rows B already opened.
    for (const t of ["b1", "b2", "b3"]) await addBeat(tome.id, plots[1].id, t);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    await expectSpineIntact(tome.id);

    await addBeat(tome.id, plots[0].id, "middle", 1);
    await expectSpineIntact(tome.id);

    const a = await beatsOf(plots[0].id);
    expect(a.map((x) => x.title)).toEqual(["a1", "middle", "a2"]);
    expect(a.map((x) => x.sortOrder)).toEqual([0, 1, 2]);
  });

  it("opens a fresh row for a mid-plot insert and keeps the other plots aligned", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    for (const t of ["b1", "b2"]) await addBeat(tome.id, plots[1].id, t);

    expect(await columnOf(tome.id, plots[1].id)).toEqual(["b1", "b2"]);

    await addBeat(tome.id, plots[0].id, "wedge", 1);
    await expectSpineIntact(tome.id);

    // A gains a row; B keeps both beats and simply gains a gap where the wedge
    // went, so the pairs that were aligned before still are.
    expect(await columnOf(tome.id, plots[0].id)).toEqual(["a1", "wedge", "a2"]);
    expect(await columnOf(tome.id, plots[1].id)).toEqual(["b1", null, "b2"]);
  });
});

describe("reorderPlotItems permutes rows rather than renumbering", () => {
  it("leaves every other plot byte-identical", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    for (const t of ["a1", "a2", "a3"]) await addBeat(tome.id, plots[0].id, t);
    for (const t of ["b1", "b2", "b3"]) await addBeat(tome.id, plots[1].id, t);

    const spine = await rowIds(tome.id);
    const untouched = await beatsOf(plots[1].id);

    const a = await beatsOf(plots[0].id);
    await store.reorderPlotItems(plots[0].id, [a[2].id, a[0].id, a[1].id]);
    await expectSpineIntact(tome.id);

    expect((await beatsOf(plots[0].id)).map((x) => x.title)).toEqual([
      "a3",
      "a1",
      "a2",
    ]);
    // The set of occupied rows is unchanged, so B gained no gap and lost none.
    expect(await rowIds(tome.id)).toEqual(spine);
    expect(await beatsOf(plots[1].id)).toEqual(untouched);
    expect(await columnOf(tome.id, plots[1].id)).toEqual(["b1", "b2", "b3"]);
  });

  it("drops a stale drag whose beat set no longer matches", async () => {
    const { tome, plots } = await makeTome(["A"]);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    const a = await beatsOf(plots[0].id);

    await store.reorderPlotItems(plots[0].id, [a[1].id]);
    await expectSpineIntact(tome.id);
    expect((await beatsOf(plots[0].id)).map((x) => x.title)).toEqual(["a1", "a2"]);
  });
});

describe("row mutations move every plot together", () => {
  it("shifts the whole spine when a row is inserted mid-way", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    for (const t of ["b1", "b2"]) await addBeat(tome.id, plots[1].id, t);

    await store.insertPlotRow(tome.id, 1);
    await expectSpineIntact(tome.id);

    expect(await columnOf(tome.id, plots[0].id)).toEqual(["a1", null, "a2"]);
    expect(await columnOf(tome.id, plots[1].id)).toEqual(["b1", null, "b2"]);
  });

  it("reorders rows and recomputes every plot's sortOrder from them", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    for (const t of ["a1", "a2", "a3"]) await addBeat(tome.id, plots[0].id, t);
    for (const t of ["b1", "b2", "b3"]) await addBeat(tome.id, plots[1].id, t);

    const spine = await rowIds(tome.id);
    await store.reorderPlotRows(tome.id, [spine[2], spine[0], spine[1]]);
    await expectSpineIntact(tome.id);

    expect(await columnOf(tome.id, plots[0].id)).toEqual(["a3", "a1", "a2"]);
    expect(await columnOf(tome.id, plots[1].id)).toEqual(["b3", "b1", "b2"]);
  });

  it("deletes a row across every plot, and counts the cost first", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    for (const t of ["b1", "b2"]) await addBeat(tome.id, plots[1].id, t);

    const spine = await rowIds(tome.id);
    expect(await store.countPlotRowBeats(spine[0])).toEqual({ beats: 2, plots: 2 });

    await store.deletePlotRow({ id: spine[0], tomeId: tome.id });
    await expectSpineIntact(tome.id);

    expect(await rowIds(tome.id)).toEqual([spine[1]]);
    expect(await columnOf(tome.id, plots[0].id)).toEqual(["a2"]);
    expect(await columnOf(tome.id, plots[1].id)).toEqual(["b2"]);
  });
});

describe("movePlotItemToRow", () => {
  it("swaps when the target cell in that plot is taken", async () => {
    const { tome, plots } = await makeTome(["A"]);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    const spine = await rowIds(tome.id);
    const [first] = await beatsOf(plots[0].id);

    await store.movePlotItemToRow(first.id, spine[1]);
    await expectSpineIntact(tome.id);
    expect(await columnOf(tome.id, plots[0].id)).toEqual(["a2", "a1"]);
  });

  it("moves into a free cell without disturbing another plot", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    for (const t of ["b1", "b2"]) await addBeat(tome.id, plots[1].id, t);
    await addBeat(tome.id, plots[0].id, "a1");
    const spine = await rowIds(tome.id);
    const [a1] = await beatsOf(plots[0].id);

    await store.movePlotItemToRow(a1.id, spine[1]);
    await expectSpineIntact(tome.id);
    expect(await columnOf(tome.id, plots[0].id)).toEqual([null, "a1"]);
    expect(await columnOf(tome.id, plots[1].id)).toEqual(["b1", "b2"]);
  });

  it("ignores a drop onto a row of another tome", async () => {
    const { tome, plots } = await makeTome(["A"]);
    await addBeat(tome.id, plots[0].id, "a1");
    const other = await makeTome(["X"]);
    await addBeat(other.tome.id, other.plots[0].id, "x1");

    const [a1] = await beatsOf(plots[0].id);
    const foreign = (await rowIds(other.tome.id))[0];
    await store.movePlotItemToRow(a1.id, foreign);

    await expectSpineIntact(tome.id);
    expect((await beatsOf(plots[0].id))[0].plotRowId).toBe(
      (await rowIds(tome.id))[0],
    );
  });
});

describe("gaps and housekeeping", () => {
  it("leaves a deleted beat's row standing as a gap", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    for (const t of ["b1", "b2"]) await addBeat(tome.id, plots[1].id, t);

    const [a1] = await beatsOf(plots[0].id);
    await store.deletePlotItem({ id: a1.id, plotId: plots[0].id });
    await expectSpineIntact(tome.id);

    expect(await rowIds(tome.id)).toHaveLength(2);
    expect(await columnOf(tome.id, plots[0].id)).toEqual([null, "a2"]);
    expect(await columnOf(tome.id, plots[1].id)).toEqual(["b1", "b2"]);
  });

  it("removeEmptyPlotRows drops only rows no plot in the tome occupies", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    for (const t of ["b1", "b2"]) await addBeat(tome.id, plots[1].id, t);
    await store.insertPlotRow(tome.id, 1);

    // Row 1 is empty in both plots; rows 0 and 2 are not.
    expect(await store.removeEmptyPlotRows(tome.id)).toBe(1);
    await expectSpineIntact(tome.id);
    expect(await columnOf(tome.id, plots[0].id)).toEqual(["a1", "a2"]);

    // A row still held by *any* plot survives, even when the plot on screen
    // shows a gap there.
    const [b1] = await beatsOf(plots[1].id);
    await store.deletePlotItem({ id: b1.id, plotId: plots[1].id });
    expect(await store.removeEmptyPlotRows(tome.id)).toBe(0);
    await expectSpineIntact(tome.id);
  });
});

describe("createPlotFromTemplate", () => {
  it("fills the spine from the top so a late subplot lines up with the opening", async () => {
    const { tome, plots } = await makeTome(["A"]);
    for (const t of ["a1", "a2", "a3"]) await addBeat(tome.id, plots[0].id, t);
    const spine = await rowIds(tome.id);

    const sub = await store.createPlotFromTemplate(tome.id, "three-act", {
      name: "Subplot",
    });
    await expectSpineIntact(tome.id);

    const beats = await beatsOf(sub.id);
    expect(beats.length).toBeGreaterThan(3);
    // Its first beat stands on the tome's first row, not below A's last.
    expect(beats[0].plotRowId).toBe(spine[0]);
    expect(await columnOf(tome.id, plots[0].id)).toEqual([
      "a1",
      "a2",
      "a3",
      ...Array(beats.length - 3).fill(null),
    ]);
  });

  it("creates a plain empty plot for an unknown template", async () => {
    const { tome } = await makeTome();
    const plot = await store.createPlotFromTemplate(tome.id, "none", {
      name: "Bare",
    });
    expect(plot.name).toBe("Bare");
    expect(await db.plotItems.where("plotId").equals(plot.id).count()).toBe(0);
    await expectSpineIntact(tome.id);
  });
});
