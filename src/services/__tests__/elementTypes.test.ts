import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import type { FieldDefinition } from "../../models/ElementType";
import { store } from "../store";
import { makeTome } from "./helpers";

/**
 * The per-tome element type registry and its custom fields.
 *
 * `saveType` normalizes more than it looks: it derives the slug, appends a new
 * type to the end of the tome's list, renumbers the field definitions from
 * their position, and strips the `options` array off a field that is no longer
 * a list. Each of those is something the form relies on and none of them was
 * covered.
 */

const field = (over: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id: "f1",
  name: "Age",
  kind: "text",
  required: false,
  sortOrder: 0,
  ...over,
});

describe("saveType", () => {
  it("derives the slug from the name", async () => {
    const { tome } = await makeTome();

    const type = await store.saveType({
      tomeId: tome.id,
      name: "  Secret  Society!  ",
      fieldDefinitions: [],
    });

    expect(type.name).toBe("Secret  Society!");
    expect(type.slug).toBe("secret-society");
  });

  it("falls back to a usable slug for a name with nothing sluggable in it", async () => {
    const { tome } = await makeTome();

    const type = await store.saveType({
      tomeId: tome.id,
      name: "—",
      fieldDefinitions: [],
    });

    // An empty slug would collide with every other unsluggable name and read as
    // a missing value in the URL.
    expect(type.slug).toBe("type");
  });

  it("appends each new type to the end of the tome's list", async () => {
    const { tome } = await makeTome();

    const first = await store.saveType({ tomeId: tome.id, name: "Character", fieldDefinitions: [] });
    const second = await store.saveType({ tomeId: tome.id, name: "Place", fieldDefinitions: [] });

    expect([first.sortOrder, second.sortOrder]).toEqual([0, 1]);
  });

  it("keeps a type's position and created time across a rename", async () => {
    const { tome } = await makeTome();
    await store.saveType({ tomeId: tome.id, name: "Character", fieldDefinitions: [] });
    const place = await store.saveType({ tomeId: tome.id, name: "Place", fieldDefinitions: [] });

    const renamed = await store.saveType({ ...place, name: "Location" });

    expect(renamed.sortOrder).toBe(1);
    expect(renamed.slug).toBe("location");
    expect(renamed.createdAt).toBe(place.createdAt);
    expect(await db.elementTypes.count()).toBe(2);
  });

  it("numbers the fields by their position in the list the editor hands over", async () => {
    const { tome } = await makeTome();

    const type = await store.saveType({
      tomeId: tome.id,
      name: "Character",
      fieldDefinitions: [
        field({ id: "a", name: "  Age  ", sortOrder: 40 }),
        field({ id: "b", name: "Height", sortOrder: 7 }),
      ],
    });

    // The drag-to-reorder editor renders in array order, so the array is the
    // truth and whatever sortOrder rode along is stale.
    expect(type.fieldDefinitions.map((f) => f.sortOrder)).toEqual([0, 1]);
    expect(type.fieldDefinitions[0].name).toBe("Age");
  });

  it("trims a select's choices and drops the blank ones", async () => {
    const { tome } = await makeTome();

    const type = await store.saveType({
      tomeId: tome.id,
      name: "Character",
      fieldDefinitions: [
        field({ kind: "select", options: ["  Alive  ", "", "Dead", "   "] }),
      ],
    });

    expect(type.fieldDefinitions[0].options).toEqual(["Alive", "Dead"]);
  });

  it("strips the choices off a field that stopped being a list", async () => {
    const { tome } = await makeTome();

    const type = await store.saveType({
      tomeId: tome.id,
      name: "Character",
      fieldDefinitions: [field({ kind: "text", options: ["Alive", "Dead"] })],
    });

    // Left in place they would come back if the author switched the kind again,
    // silently resurrecting choices they had removed.
    expect(type.fieldDefinitions[0].options).toBeUndefined();
  });

  it("refuses a blank name", async () => {
    const { tome } = await makeTome();

    await expect(
      store.saveType({ tomeId: tome.id, name: "   ", fieldDefinitions: [] }),
    ).rejects.toThrow(/name is required/);
    expect(await db.elementTypes.count()).toBe(0);
  });

  it("refuses a malformed field set before writing anything", async () => {
    const { tome } = await makeTome();

    await expect(
      store.saveType({
        tomeId: tome.id,
        name: "Character",
        fieldDefinitions: [field({ id: "a" }), field({ id: "b", name: "age" })],
      }),
    ).rejects.toThrow(/unique and not blank/);
    expect(await db.elementTypes.count()).toBe(0);
  });
});

describe("the delete-warning counts", () => {
  const seed = async () => {
    const { tome } = await makeTome();
    const type = await store.saveType({
      tomeId: tome.id,
      name: "Character",
      fieldDefinitions: [field({ id: "age", name: "Age" })],
    });
    const add = (name: string, attributes: Record<string, string>) =>
      store.saveElement({
        tomeId: tome.id,
        elementTypeId: type.id,
        name,
        description: "",
        attributes,
      });
    await add("Ash", { age: "31" });
    await add("Bel", { age: "" });
    await add("Cyn", {});
    return { tome, type };
  };

  it("counts every element of the type", async () => {
    const { type } = await seed();

    expect(await store.countElements(type.id)).toBe(3);
  });

  it("counts only the elements that would actually lose a value", async () => {
    const { type } = await seed();

    // Blank and absent both mean "nothing to lose" — warning about them would
    // overstate the cost of removing the field.
    expect(await store.countField(type.id, "age")).toBe(1);
  });

  it("counts nothing for a field no element ever filled in", async () => {
    const { type } = await seed();

    expect(await store.countField(type.id, "height")).toBe(0);
  });
});
