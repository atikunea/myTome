import { db } from "../models/db";
import type { Element } from "../models/Element";
import { elementSearchText, untitledElement } from "../models/Element";
import type { ElementType, FieldDefinition } from "../models/ElementType";
import type { Relationship } from "../models/Relationship";
import { asProseDocument, documentText, emptyProseDocument } from "../lexical/blocks";
import { detachElements, now, observe, uid } from "./internal";
import { isEmptyFieldValue, validateElement, validateRelationship } from "./validate";

/**
 * Fills in `description`, `descriptionText` and `searchText` from whatever the
 * caller supplied. **This is the only place those three are written**, which is
 * what keeps the two mirrors honest — every mutation below ends here, and so
 * does a restore.
 *
 * A description arriving as plain text is wrapped rather than rejected: pre-v9
 * rows reach this through `restoreBackup`, and so do the tests and any hand-fed
 * caller. `asProseDocument` is a no-op on a document.
 */
const withDerivedText = <T extends Pick<Element, "name" | "description" | "attributes">>(
  element: T,
  fields: FieldDefinition[],
): T => {
  const description = asProseDocument(element.description);
  const descriptionText = documentText(description);
  return {
    ...element,
    description,
    descriptionText,
    searchText: elementSearchText({ ...element, descriptionText }, fields),
  };
};

const typeFor = async (elementTypeId: string): Promise<ElementType> => {
  const type = await db.elementTypes.get(elementTypeId);
  if (!type) throw new Error("That element type no longer exists.");
  return type;
};

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
    return observe(
      () =>
        db.elements
          .where("[tomeId+elementTypeId]")
          .equals([tomeId, typeId])
          .filter((x) => !x.deletedAt)
          .toArray(),
      callback,
    );
  },
  /** One element, for the page that shows it. `null` once it is gone. */
  observeElement(id: string, callback: (v: Element | null) => void) {
    return observe(async () => (await db.elements.get(id)) ?? null, callback);
  },
  observeTomeElements(tomeId: string, callback: (v: Element[]) => void) {
    return observe(
      () =>
        db.elements
          .where("tomeId")
          .equals(tomeId)
          .filter((x) => !x.deletedAt)
          .toArray(),
      callback,
    );
  },
  observeElementRelationships(
    tomeId: string,
    elementId: string,
    callback: (v: Relationship[]) => void,
  ) {
    return observe(
      () =>
        db.relationships
          .where("tomeId")
          .equals(tomeId)
          .filter((r) => r.fromElementId === elementId || r.toElementId === elementId)
          .reverse()
          .sortBy("updatedAt"),
      callback,
    );
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
    const type = await typeFor(input.elementTypeId);
    validateElement(input.name, input.attributes, type.fieldDefinitions);
    const existing = input.id ? await db.elements.get(input.id) : undefined;
    const time = now();
    const element: Element = withDerivedText(
      {
        id: existing?.id ?? uid(),
        tomeId: input.tomeId,
        elementTypeId: input.elementTypeId,
        name: input.name.trim(),
        description: input.description,
        descriptionText: "",
        searchText: "",
        attributes: input.attributes,
        image: input.image,
        createdAt: existing?.createdAt ?? time,
        updatedAt: time,
      },
      type.fieldDefinitions,
    );
    await db.elements.put(element);
    return element;
  },
  /**
   * The element page's write: one field at a time, on the autosave debounce.
   *
   * It takes a **patch and re-reads the row inside the transaction** rather
   * than accepting a whole element, because the page has several fields writing
   * to one row and a live query's echo is not synchronous. A caller that merged
   * against the element it last observed would silently revert the field it
   * edited a moment ago; here the merge happens over what is actually stored.
   */
  async updateElement(
    id: string,
    patch: Partial<Pick<Element, "name" | "description" | "attributes" | "image">>,
  ) {
    return db.transaction("rw", db.elements, db.elementTypes, async () => {
      const existing = await db.elements.get(id);
      if (!existing) throw new Error("That element no longer exists.");
      const type = await typeFor(existing.elementTypeId);
      const merged = {
        ...existing,
        ...patch,
        name: (patch.name ?? existing.name).trim(),
        attributes: { ...existing.attributes, ...patch.attributes },
      };
      validateElement(merged.name, merged.attributes, type.fieldDefinitions);
      const element = withDerivedText(
        { ...merged, updatedAt: now() },
        type.fieldDefinitions,
      );
      await db.elements.put(element);
      return element;
    });
  },
  /**
   * An element created at the click site, opened on its real id.
   *
   * The same arrangement as `createDraftWriteItem` and for the same reason: the
   * element page is a view with inline editing, so it has nothing to show for a
   * row that does not exist yet, and creating one from a mount effect would
   * leave an orphan on every click under `StrictMode`. An untouched draft is
   * swept by `discardElementIfBlank`.
   */
  async createDraftElement(tomeId: string, elementTypeId: string) {
    const time = now();
    const element: Element = {
      id: uid(),
      tomeId,
      elementTypeId,
      name: untitledElement,
      description: emptyProseDocument,
      descriptionText: "",
      searchText: untitledElement,
      attributes: {},
      createdAt: time,
      updatedAt: time,
    };
    await db.elements.put(element);
    return element;
  },
  /**
   * Drops a draft the author opened and left untouched — default name, nothing
   * written, no image, no relationships. Relationships count because they are
   * saved as they are filled in rather than staged, so an element that gained
   * one is not blank however empty its own fields are.
   */
  async discardElementIfBlank(id: string) {
    await db.transaction(
      "rw",
      db.elements,
      db.elementTypes,
      db.relationships,
      async () => {
        const element = await db.elements.get(id);
        if (!element) return;
        if (element.name.trim() !== untitledElement) return;
        if (element.descriptionText.trim() || element.image) return;
        const type = await db.elementTypes.get(element.elementTypeId);
        const fields = type?.fieldDefinitions ?? [];
        if (fields.some((field) => !isEmptyFieldValue(field, element.attributes[field.id])))
          return;
        const linked = await db.relationships
          .where("tomeId")
          .equals(element.tomeId)
          .filter((r) => r.fromElementId === id || r.toElementId === id)
          .count();
        if (linked) return;
        await db.elements.delete(id);
      },
    );
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
