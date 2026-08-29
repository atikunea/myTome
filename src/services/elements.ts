import { liveQuery } from "dexie";
import { db } from "../models/db";
import type { Element } from "../models/Element";
import type { Relationship } from "../models/Relationship";
import { detachElements, now, uid } from "./internal";
import { validateElement, validateRelationship } from "./validate";

/**
 * Elements and the relationships between them. `Element.deletedAt` is read by
 * the observers but never written — there is no soft delete, no trash and no
 * restore; `deleteElement` hard-deletes the row.
 */
export const elementStore = {
  observeElements(
    tomeId: string,
    typeId: string,
    callback: (v: Element[]) => void,
  ) {
    return liveQuery(() =>
      db.elements
        .where("[tomeId+elementTypeId]")
        .equals([tomeId, typeId])
        .filter((x) => !x.deletedAt)
        .toArray(),
    ).subscribe({ next: callback, error: console.error });
  },
  observeTomeElements(tomeId: string, callback: (v: Element[]) => void) {
    return liveQuery(() =>
      db.elements
        .where("tomeId")
        .equals(tomeId)
        .filter((x) => !x.deletedAt)
        .toArray(),
    ).subscribe({ next: callback, error: console.error });
  },
  observeElementRelationships(
    tomeId: string,
    elementId: string,
    callback: (v: Relationship[]) => void,
  ) {
    return liveQuery(() =>
      db.relationships
        .where("tomeId")
        .equals(tomeId)
        .filter((r) => r.fromElementId === elementId || r.toElementId === elementId)
        .reverse()
        .sortBy("updatedAt"),
    ).subscribe({ next: callback, error: console.error });
  },
  /** Labels this author has already used between these two types, most recent first. */
  async suggestRelationshipLabels(
    tomeId: string,
    fromElementTypeId: string,
    toElementTypeId: string,
  ) {
    const rows = await db.relationships
      .where("[tomeId+fromElementTypeId+toElementTypeId]")
      .equals([tomeId, fromElementTypeId, toElementTypeId])
      .reverse()
      .sortBy("updatedAt");
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const row of rows) {
      const key = row.label.trim().toLocaleLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        labels.push(row.label);
      }
    }
    return labels;
  },
  async saveElement(
    input: Partial<Element> &
      Pick<
        Element,
        "tomeId" | "elementTypeId" | "name" | "description" | "attributes"
      >,
  ) {
    const type = await db.elementTypes.get(input.elementTypeId);
    if (!type) throw new Error("That element type no longer exists.");
    validateElement(input.name, input.attributes, type.fieldDefinitions);
    const existing = input.id ? await db.elements.get(input.id) : undefined;
    const time = now();
    const element: Element = {
      id: existing?.id ?? uid(),
      tomeId: input.tomeId,
      elementTypeId: input.elementTypeId,
      name: input.name.trim(),
      description: input.description.trim(),
      attributes: input.attributes,
      image: input.image,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
    };
    await db.elements.put(element);
    return element;
  },
  async saveElementRelationships(
    element: Pick<Element, "id" | "tomeId" | "elementTypeId">,
    rows: {
      id?: string;
      otherElementId: string;
      otherElementTypeId: string;
      label: string;
    }[],
  ) {
    for (const row of rows)
      validateRelationship(element.id, row.otherElementId, row.label);
    await db.transaction("rw", db.relationships, async () => {
      const existing = await db.relationships
        .where("tomeId")
        .equals(element.tomeId)
        .filter(
          (r) => r.fromElementId === element.id || r.toElementId === element.id,
        )
        .toArray();
      const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id));
      const removed = existing.filter((r) => !keepIds.has(r.id));
      if (removed.length)
        await db.relationships.bulkDelete(removed.map((r) => r.id));
      const time = now();
      for (const row of rows) {
        if (row.id) {
          await db.relationships.update(row.id, {
            label: row.label.trim(),
            updatedAt: time,
          });
        } else {
          const relationship: Relationship = {
            id: uid(),
            tomeId: element.tomeId,
            fromElementId: element.id,
            fromElementTypeId: element.elementTypeId,
            toElementId: row.otherElementId,
            toElementTypeId: row.otherElementTypeId,
            label: row.label.trim(),
            createdAt: time,
            updatedAt: time,
          };
          await db.relationships.add(relationship);
        }
      }
    });
  },
  async deleteElement(id: string) {
    await db.transaction(
      "rw",
      db.elements,
      db.relationships,
      db.plotItems,
      async () => {
        await db.relationships
          .filter((r) => r.fromElementId === id || r.toElementId === id)
          .delete();
        await detachElements([id]);
        await db.elements.delete(id);
      },
    );
  },
};
