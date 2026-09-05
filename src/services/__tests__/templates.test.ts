import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import {
  defaultTomeTemplateId,
  tomeTemplateById,
  tomeTemplates,
} from "../../models/TomeTemplate";
import { store } from "../store";
import { makeTome } from "./helpers";

/**
 * `applyTomeTemplate` — the element types a new tome starts life with.
 *
 * `createPlotFromTemplate` is covered in `spine.test.ts`, where its interesting
 * property (filling the spine from the top so a late subplot lines up with the
 * opening) actually lives. What is left here is the type half, and one rule the
 * registry cannot enforce on its own: a template never demands a value.
 */

describe("applyTomeTemplate", () => {
  it("creates the template's types, in the registry's order", async () => {
    const { tome } = await makeTome();
    const template = tomeTemplateById("general");

    await store.applyTomeTemplate(tome.id, "general");

    const types = await db.elementTypes.where("tomeId").equals(tome.id).sortBy("sortOrder");
    expect(types.map((type) => type.name)).toEqual(
      template.types.map((type) => type.name),
    );
    expect(types.map((type) => type.sortOrder)).toEqual(types.map((_, i) => i));
  });

  it("gives every created type a slug the URL can carry", async () => {
    const { tome } = await makeTome();

    await store.applyTomeTemplate(tome.id, "general");

    const types = await db.elementTypes.where("tomeId").equals(tome.id).toArray();
    expect(types.every((type) => /^[a-z0-9-]+$/.test(type.slug))).toBe(true);
  });

  it("carries each type's fields with their choices, numbered by position", async () => {
    const { tome } = await makeTome();
    // A template with a select field somewhere in it, whichever one that is.
    const template = tomeTemplates.find((candidate) =>
      candidate.types.some((type) => type.fields?.some((f) => f.kind === "select")),
    )!;

    await store.applyTomeTemplate(tome.id, template.id);

    const types = await db.elementTypes.where("tomeId").equals(tome.id).sortBy("sortOrder");
    for (const [i, type] of types.entries()) {
      const source = template.types[i];
      expect(type.fieldDefinitions.map((f) => f.name)).toEqual(
        (source.fields ?? []).map((f) => f.name),
      );
      expect(type.fieldDefinitions.map((f) => f.sortOrder)).toEqual(
        type.fieldDefinitions.map((_, position) => position),
      );
    }
    const selects = types.flatMap((type) =>
      type.fieldDefinitions.filter((f) => f.kind === "select"),
    );
    expect(selects.length).toBeGreaterThan(0);
    expect(selects.every((f) => (f.options ?? []).length > 0)).toBe(true);
  });

  it("never marks a template field required", async () => {
    const { tome } = await makeTome();

    // Every template, not just one: an author sketching a character must never
    // be blocked by a field the template chose for them.
    for (const template of tomeTemplates)
      await store.applyTomeTemplate(tome.id, template.id);

    const types = await db.elementTypes.where("tomeId").equals(tome.id).toArray();
    const fields = types.flatMap((type) => type.fieldDefinitions);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f.required)).toBe(false);
  });

  it("gives every field a unique id, so validateFields would accept the result", async () => {
    const { tome } = await makeTome();

    await store.applyTomeTemplate(tome.id, "general");

    const types = await db.elementTypes.where("tomeId").equals(tome.id).toArray();
    const ids = types.flatMap((type) => type.fieldDefinitions.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back to the default template for an id the registry has never heard of", async () => {
    const { tome } = await makeTome();

    await store.applyTomeTemplate(tome.id, "no-such-template");

    const types = await db.elementTypes.where("tomeId").equals(tome.id).sortBy("sortOrder");
    expect(types.map((type) => type.name)).toEqual(
      tomeTemplateById(defaultTomeTemplateId).types.map((type) => type.name),
    );
  });

  it("creates types only for the tome it was given", async () => {
    const { tome } = await makeTome();
    const other = await store.saveTome({ title: "Other", description: "", status: "Draft" });

    await store.applyTomeTemplate(tome.id, "general");

    expect(await db.elementTypes.where("tomeId").equals(other.id).count()).toBe(0);
  });

  it("stacks a second application rather than reconciling — it is create-time only", async () => {
    const { tome } = await makeTome();
    const expected = tomeTemplateById("general").types.length;

    await store.applyTomeTemplate(tome.id, "general");
    await store.applyTomeTemplate(tome.id, "general");

    // Pinned deliberately: this is why the appliers are documented as
    // create-time. Anything that wants to re-apply a template has to grow
    // reconciliation first, and this test should fail when it does.
    expect(await db.elementTypes.where("tomeId").equals(tome.id).count()).toBe(expected * 2);
  });
});
