import Dexie, { liveQuery } from "dexie";
import { db } from "../models/db";
import type { ElementType } from "../models/ElementType";
import { detachElements, now, slugify, uid } from "./internal";
import { validateFields } from "./validate";

/**
 * The per-tome element type registry — Character, Place, Faction — and the
 * custom field definitions that live on it.
 */
export const elementTypeStore = {
  observeTypes(tomeId: string, callback: (v: ElementType[]) => void) {
    return liveQuery(() =>
      db.elementTypes
        .where("[tomeId+sortOrder]")
        .between([tomeId, Dexie.minKey], [tomeId, Dexie.maxKey])
        .toArray(),
    ).subscribe({ next: callback, error: console.error });
  },
  async saveType(
    input: Partial<ElementType> &
      Pick<ElementType, "tomeId" | "name" | "fieldDefinitions">,
  ) {
    validateFields(input.fieldDefinitions);
    const existing = input.id ? await db.elementTypes.get(input.id) : undefined;
    const time = now();
    const type: ElementType = {
      id: existing?.id ?? uid(),
      tomeId: input.tomeId,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      icon: input.icon ?? existing?.icon,
      slug: slugify(input.name),
      sortOrder:
        input.sortOrder ??
        existing?.sortOrder ??
        (await db.elementTypes.where("tomeId").equals(input.tomeId).count()),
      fieldDefinitions: input.fieldDefinitions.map((f, i) => ({
        ...f,
        name: f.name.trim(),
        options:
          f.kind === "select"
            ? f.options?.map((o) => o.trim()).filter(Boolean)
            : undefined,
        sortOrder: i,
      })),
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
    };
    if (!type.name) throw new Error("An element type name is required.");
    await db.elementTypes.put(type);
    return type;
  },
  async deleteField(type: ElementType, fieldId: string) {
    await db.transaction("rw", db.elementTypes, db.elements, async () => {
      await db.elements
        .where("elementTypeId")
        .equals(type.id)
        .modify((element) => {
          delete element.attributes[fieldId];
          element.updatedAt = now();
        });
      await db.elementTypes.update(type.id, {
        fieldDefinitions: type.fieldDefinitions.filter((f) => f.id !== fieldId),
        updatedAt: now(),
      });
    });
  },
  async deleteType(type: ElementType) {
    await db.transaction(
      "rw",
      db.elementTypes,
      db.elements,
      db.relationships,
      db.plotItems,
      async () => {
        const elementIds = await db.elements
          .where("elementTypeId")
          .equals(type.id)
          .primaryKeys();
        await detachElements(elementIds);
        await db.relationships
          .filter(
            (r) =>
              elementIds.includes(r.fromElementId) ||
              elementIds.includes(r.toElementId),
          )
          .delete();
        await db.elements.where("elementTypeId").equals(type.id).delete();
        await db.elementTypes.delete(type.id);
      },
    );
  },
  /** How many elements of the type have a value for the field — the delete warning. */
  countField(typeId: string, fieldId: string) {
    return db.elements
      .where("elementTypeId")
      .equals(typeId)
      .filter((x) => Boolean(x.attributes[fieldId]))
      .count();
  },
  countElements(typeId: string) {
    return db.elements.where("elementTypeId").equals(typeId).count();
  },
};
