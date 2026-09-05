import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { store } from "../store";
import { makeTome } from "./helpers";

/**
 * Elements and the relationships between them.
 *
 * `saveElementRelationships` is the interesting one: the element form hands it
 * the rows currently on screen and it works out the difference — a row with an
 * id is an edit, one without is new, and one that has vanished from the list is
 * a delete. That diff is the only place in the app where "what the author left
 * out" means "destroy the row", so it is worth pinning down.
 */

const setup = async () => {
  const { tome } = await makeTome();
  const character = await store.saveType({
    tomeId: tome.id,
    name: "Character",
    fieldDefinitions: [],
  });
  const place = await store.saveType({
    tomeId: tome.id,
    name: "Place",
    fieldDefinitions: [],
  });
  const make = (name: string, elementTypeId: string) =>
    store.saveElement({
      tomeId: tome.id,
      elementTypeId,
      name,
      description: "",
      attributes: {},
    });
  return {
    tome,
    character,
    place,
    ash: await make("Ash", character.id),
    bel: await make("Bel", character.id),
    cyn: await make("Cyn", character.id),
    keep: await make("The Keep", place.id),
  };
};

/**
 * Dates the relationships by label. `label` carries no index, so this walks the
 * table rather than querying it — fine for a handful of rows, and it keeps the
 * staging out of the assertions.
 */
const stampUpdatedAt = async (byLabel: Record<string, string>) => {
  for (const row of await db.relationships.toArray())
    if (byLabel[row.label])
      await db.relationships.update(row.id, { updatedAt: byLabel[row.label] });
};

/** The relationships touching one element, as `label` strings. */
const labelsFor = async (elementId: string) =>
  (await db.relationships.toArray())
    .filter((r) => r.fromElementId === elementId || r.toElementId === elementId)
    .map((r) => r.label)
    .sort();

describe("saveElement", () => {
  it("trims, stamps, and keeps the created time across an edit", async () => {
    const { tome, character } = await setup();

    const created = await store.saveElement({
      tomeId: tome.id,
      elementTypeId: character.id,
      name: "  Dov  ",
      description: "  a smith  ",
      attributes: {},
    });
    const edited = await store.saveElement({ ...created, name: "Dov the Smith" });

    expect(created.name).toBe("Dov");
    expect(created.description).toBe("a smith");
    expect(edited.id).toBe(created.id);
    expect(edited.createdAt).toBe(created.createdAt);
    expect(await db.elements.count()).toBe(1 + 4);
  });

  it("refuses an element whose type has been deleted underneath it", async () => {
    const { tome, character } = await setup();
    await store.deleteType(character);

    // The dialog may still be open from before the delete; the write must not
    // create an element no list can ever show.
    await expect(
      store.saveElement({
        tomeId: tome.id,
        elementTypeId: character.id,
        name: "Ghost",
        description: "",
        attributes: {},
      }),
    ).rejects.toThrow(/no longer exists/);
  });

  it("validates against the type's fields, not the caller's word", async () => {
    const { tome } = await setup();
    const type = await store.saveType({
      tomeId: tome.id,
      name: "Faction",
      fieldDefinitions: [
        { id: "creed", name: "Creed", kind: "text", required: true, sortOrder: 0 },
      ],
    });

    await expect(
      store.saveElement({
        tomeId: tome.id,
        elementTypeId: type.id,
        name: "The Order",
        description: "",
        attributes: {},
      }),
    ).rejects.toThrow(/Creed is required/);
  });
});

describe("saveElementRelationships", () => {
  it("adds the rows the form was given, both directions recorded", async () => {
    const { ash, bel, keep, character, place } = await setup();

    await store.saveElementRelationships(ash, [
      { otherElementId: bel.id, otherElementTypeId: character.id, label: "rival" },
      { otherElementId: keep.id, otherElementTypeId: place.id, label: "lives at" },
    ]);

    const rows = await db.relationships.toArray();
    expect(rows).toHaveLength(2);
    // The edited element is always the "from" side, and both type ids are
    // stored so the suggestion index can answer per type pair.
    expect(rows.every((r) => r.fromElementId === ash.id)).toBe(true);
    expect(rows.every((r) => r.fromElementTypeId === character.id)).toBe(true);
    expect(rows.find((r) => r.toElementId === keep.id)?.toElementTypeId).toBe(place.id);
  });

  it("deletes the rows the form no longer lists", async () => {
    const { ash, bel, cyn, character } = await setup();
    await store.saveElementRelationships(ash, [
      { otherElementId: bel.id, otherElementTypeId: character.id, label: "rival" },
      { otherElementId: cyn.id, otherElementTypeId: character.id, label: "mentor" },
    ]);
    const kept = (await db.relationships.toArray()).find((r) => r.label === "rival")!;

    // The author removed the mentor row and saved: absence is the delete.
    await store.saveElementRelationships(ash, [
      { id: kept.id, otherElementId: bel.id, otherElementTypeId: character.id, label: "rival" },
    ]);

    expect(await labelsFor(ash.id)).toEqual(["rival"]);
  });

  it("updates a kept row's label in place rather than replacing the row", async () => {
    const { ash, bel, character } = await setup();
    await store.saveElementRelationships(ash, [
      { otherElementId: bel.id, otherElementTypeId: character.id, label: "rival" },
    ]);
    const before = (await db.relationships.toArray())[0];

    await store.saveElementRelationships(ash, [
      { id: before.id, otherElementId: bel.id, otherElementTypeId: character.id, label: "  ally  " },
    ]);

    const after = (await db.relationships.toArray())[0];
    expect(await db.relationships.count()).toBe(1);
    expect(after.id).toBe(before.id);
    expect(after.label).toBe("ally");
    expect(after.createdAt).toBe(before.createdAt);
  });

  it("clears every relationship when the form is saved empty", async () => {
    const { ash, bel, character } = await setup();
    await store.saveElementRelationships(ash, [
      { otherElementId: bel.id, otherElementTypeId: character.id, label: "rival" },
    ]);

    await store.saveElementRelationships(ash, []);

    expect(await db.relationships.count()).toBe(0);
  });

  it("removes a row pointing at this element even though it was authored the other way", async () => {
    const { ash, bel, character } = await setup();
    // Bel names Ash, so the stored row runs bel -> ash.
    await store.saveElementRelationships(bel, [
      { otherElementId: ash.id, otherElementTypeId: character.id, label: "rival" },
    ]);

    // Ash's form shows that row too, and saving Ash without it must delete it.
    await store.saveElementRelationships(ash, []);

    expect(await db.relationships.count()).toBe(0);
  });

  it("leaves another element's relationships alone", async () => {
    const { ash, bel, cyn, character } = await setup();
    await store.saveElementRelationships(bel, [
      { otherElementId: cyn.id, otherElementTypeId: character.id, label: "sibling" },
    ]);

    await store.saveElementRelationships(ash, []);

    expect(await labelsFor(bel.id)).toEqual(["sibling"]);
  });

  it("validates every row before writing any of them", async () => {
    const { ash, bel, character } = await setup();

    await expect(
      store.saveElementRelationships(ash, [
        { otherElementId: bel.id, otherElementTypeId: character.id, label: "rival" },
        { otherElementId: ash.id, otherElementTypeId: character.id, label: "self" },
      ]),
    ).rejects.toThrow(/cannot be related to itself/);
    // The valid first row must not have landed: the dialog stays open showing
    // the error, and a half-saved form would be written twice on the retry.
    expect(await db.relationships.count()).toBe(0);
  });
});

describe("suggestRelationshipLabels", () => {
  it("offers labels this author has used between the same two types, newest first", async () => {
    const { ash, bel, cyn, character } = await setup();
    await store.saveElementRelationships(ash, [
      { otherElementId: bel.id, otherElementTypeId: character.id, label: "rival" },
    ]);
    await store.saveElementRelationships(cyn, [
      { otherElementId: bel.id, otherElementTypeId: character.id, label: "mentor" },
    ]);
    // Two writes in one tick share a millisecond, and `updatedAt` is an ISO
    // string — so the recency the suggestion index sorts by has to be staged
    // here rather than left to how fast the test ran.
    await stampUpdatedAt({ rival: "2026-01-01T00:00:00.000Z", mentor: "2026-06-01T00:00:00.000Z" });

    const labels = await store.suggestRelationshipLabels(
      ash.tomeId,
      character.id,
      character.id,
    );

    expect(labels).toEqual(["mentor", "rival"]);
  });

  it("offers each label once, however it was capitalised", async () => {
    const { ash, bel, cyn, character } = await setup();
    await store.saveElementRelationships(ash, [
      { otherElementId: bel.id, otherElementTypeId: character.id, label: "Rival" },
    ]);
    await store.saveElementRelationships(cyn, [
      { otherElementId: bel.id, otherElementTypeId: character.id, label: "rival" },
    ]);

    const labels = await store.suggestRelationshipLabels(
      ash.tomeId,
      character.id,
      character.id,
    );

    expect(labels).toHaveLength(1);
  });

  it("does not offer a label used between a different pair of types", async () => {
    const { ash, keep, character, place } = await setup();
    await store.saveElementRelationships(ash, [
      { otherElementId: keep.id, otherElementTypeId: place.id, label: "lives at" },
    ]);

    expect(
      await store.suggestRelationshipLabels(ash.tomeId, character.id, character.id),
    ).toEqual([]);
    expect(
      await store.suggestRelationshipLabels(ash.tomeId, character.id, place.id),
    ).toEqual(["lives at"]);
  });
});
