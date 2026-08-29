import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { store } from "../store";
import { addBeat, beatsOf, expectSpineIntact, makeTome } from "./helpers";

/** A tome with one element type, two elements, a plot, a beat and a write item. */
const fullTome = async () => {
  const { tome, plots } = await makeTome(["A"]);
  const type = await store.saveType({
    tomeId: tome.id,
    name: "Character",
    fieldDefinitions: [
      { id: "age", name: "Age", kind: "text", required: false, sortOrder: 0 },
    ],
  });
  const ash = await store.saveElement({
    tomeId: tome.id,
    elementTypeId: type.id,
    name: "Ash",
    description: "",
    attributes: { age: "31" },
  });
  const bel = await store.saveElement({
    tomeId: tome.id,
    elementTypeId: type.id,
    name: "Bel",
    description: "",
    attributes: { age: "44" },
  });
  await store.saveElementRelationships(ash, [
    { otherElementId: bel.id, otherElementTypeId: type.id, label: "rival" },
  ]);
  const write = await store.createDraftWriteItem(tome.id, "passage");
  const beat = await addBeat(tome.id, plots[0].id, "the duel");
  await store.savePlotItem({
    ...beat,
    attachedElementIds: [ash.id, bel.id],
    writeItemIds: [write.id],
  });
  return { tome, plot: plots[0], type, ash, bel, write };
};

describe("deleteTome", () => {
  it("clears every one of the eight tables", async () => {
    const { tome } = await fullTome();
    // A second tome proves the cascade is scoped, not a wipe.
    const survivor = await fullTome();

    await store.deleteTome(tome.id);

    for (const table of [
      db.tomes,
      db.elementTypes,
      db.elements,
      db.relationships,
      db.plots,
      db.plotRows,
      db.plotItems,
      db.writeItems,
    ]) {
      const left = await table.toArray();
      expect(left.length, `${table.name} still holds rows of the deleted tome`)
        .toBeGreaterThan(0);
      expect(
        left.every((row) => ("tomeId" in row ? row.tomeId : row.id) !== tome.id),
        `${table.name} kept a row of the deleted tome`,
      ).toBe(true);
    }
    expect(await db.tomes.get(survivor.tome.id)).toBeDefined();
  });
});

describe("deleteElement", () => {
  it("takes its relationships and detaches it from every beat", async () => {
    const { ash, bel } = await fullTome();

    await store.deleteElement(ash.id);

    expect(await db.elements.get(ash.id)).toBeUndefined();
    expect(await db.relationships.count()).toBe(0);
    const attached = (await db.plotItems.toArray()).flatMap(
      (item) => item.attachedElementIds,
    );
    expect(attached).toEqual([bel.id]);
  });
});

describe("deleteType", () => {
  it("takes its elements, their relationships and their beat attachments", async () => {
    const { tome, type } = await fullTome();

    await store.deleteType(type);

    expect(await db.elementTypes.get(type.id)).toBeUndefined();
    expect(await db.elements.where("tomeId").equals(tome.id).count()).toBe(0);
    expect(await db.relationships.where("tomeId").equals(tome.id).count()).toBe(0);
    const beat = (await db.plotItems.where("tomeId").equals(tome.id).toArray())[0];
    expect(beat.attachedElementIds).toEqual([]);
  });
});

describe("deleteField", () => {
  it("strips the attribute off every element of the type", async () => {
    const { type, ash } = await fullTome();

    await store.deleteField(type, "age");

    expect((await db.elementTypes.get(type.id))!.fieldDefinitions).toEqual([]);
    expect((await db.elements.get(ash.id))!.attributes).toEqual({});
  });
});

describe("write item removal", () => {
  it("detaches a deleted write item from the beats composing it", async () => {
    const { write } = await fullTome();

    await store.deleteWriteItem(write.id);

    expect(await db.writeItems.get(write.id)).toBeUndefined();
    expect((await db.plotItems.toArray())[0].writeItemIds).toEqual([]);
  });

  it("discards an untouched draft but keeps one that was typed into", async () => {
    const { tome } = await makeTome();
    const untouched = await store.createDraftWriteItem(tome.id, "snippet");
    await store.discardWriteItemIfBlank(untouched.id);
    expect(await db.writeItems.get(untouched.id)).toBeUndefined();

    const typed = await store.createDraftWriteItem(tome.id, "snippet");
    await store.saveWriteItem({
      id: typed.id,
      title: "Untitled",
      type: "snippet",
      content: "{}",
      preview: "the rain began",
    });
    await store.discardWriteItemIfBlank(typed.id);
    expect(await db.writeItems.get(typed.id)).toBeDefined();
  });

  it("appends a draft created from a beat to that beat's text", async () => {
    const { tome, plots } = await makeTome(["A"]);
    const beat = await addBeat(tome.id, plots[0].id, "the duel");

    const first = await store.createDraftWriteItem(tome.id, "passage", beat.id);
    const second = await store.createDraftWriteItem(tome.id, "passage", beat.id);

    expect((await db.plotItems.get(beat.id))!.writeItemIds).toEqual([
      first.id,
      second.id,
    ]);
    expect(await store.composingPlotItems(first.id)).toHaveLength(1);
  });
});

describe("deletePlot", () => {
  it("takes its beats, compacts the remaining plots, and leaves the spine", async () => {
    const { tome, plots } = await makeTome(["A", "B", "C"]);
    for (const t of ["a1", "a2"]) await addBeat(tome.id, plots[0].id, t);
    for (const t of ["b1", "b2"]) await addBeat(tome.id, plots[1].id, t);

    await store.deletePlot({ id: plots[1].id, tomeId: tome.id });

    expect(await beatsOf(plots[1].id)).toEqual([]);
    const left = await db.plots.where("tomeId").equals(tome.id).sortBy("sortOrder");
    expect(left.map((p) => p.name)).toEqual(["A", "C"]);
    expect(left.map((p) => p.sortOrder)).toEqual([0, 1]);
    // Deleting a plot is not housekeeping: the rows its beats stood on remain,
    // exactly as deleting a single beat leaves its row standing.
    expect(await db.plotRows.where("tomeId").equals(tome.id).count()).toBe(2);
    await expectSpineIntact(tome.id);
  });
});
