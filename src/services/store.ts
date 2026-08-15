import Dexie, { liveQuery } from "dexie";
import { db } from "../models/db";
import type { ElementType, FieldDefinition } from "../models/ElementType";
import { starterTypes } from "../models/ElementType";
import type { Element } from "../models/Element";
import type { ImageSource, Tome } from "../models/Tome";
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "type";
export const imageUrl = (image?: ImageSource) =>
  image?.kind === "url"
    ? image.url
    : image?.kind === "local"
      ? URL.createObjectURL(image.blob)
      : undefined;
export const imageFrom = async (
  url: string,
  file?: File,
): Promise<ImageSource | undefined> => {
  if (file) return { kind: "local", blob: file };
  if (!url.trim()) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new Error("Image URLs must use https.");
  return { kind: "url", url: parsed.toString() };
};
export function validateFields(fields: FieldDefinition[]) {
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const field of fields) {
    if (!field.id.trim() || ids.has(field.id))
      throw new Error("Each field needs a unique identifier.");
    ids.add(field.id);
    const name = field.name.trim().toLocaleLowerCase();
    if (!name || names.has(name))
      throw new Error("Field names must be unique and not blank.");
    names.add(name);
    if (field.kind === "select") {
      const opts = (field.options ?? []).map((x) => x.trim()).filter(Boolean);
      if (
        !opts.length ||
        new Set(opts.map((x) => x.toLocaleLowerCase())).size !== opts.length
      )
        throw new Error(`"${field.name}" needs unique list choices.`);
    }
  }
}
export function validateElement(
  name: string,
  attributes: Record<string, string>,
  fields: FieldDefinition[],
) {
  if (!name.trim()) throw new Error("Name is required.");
  for (const field of fields) {
    const value = attributes[field.id]?.trim() ?? "";
    if (field.required && !value) throw new Error(`${field.name} is required.`);
    if (
      value &&
      field.kind === "select" &&
      !(field.options ?? []).includes(value)
    )
      throw new Error(`${field.name} must use a listed choice.`);
  }
}
export const store = {
  observeTomes(callback: (v: Tome[]) => void) {
    return liveQuery(() =>
      db.tomes.orderBy("updatedAt").reverse().toArray(),
    ).subscribe({ next: callback, error: console.error });
  },
  observeTome(id: string, callback: (v: Tome | undefined) => void) {
    return liveQuery(() => db.tomes.get(id)).subscribe({
      next: callback,
      error: console.error,
    });
  },
  observeTypes(tomeId: string, callback: (v: ElementType[]) => void) {
    return liveQuery(() =>
      db.elementTypes
        .where("[tomeId+sortOrder]")
        .between([tomeId, Dexie.minKey], [tomeId, Dexie.maxKey])
        .toArray(),
    ).subscribe({ next: callback, error: console.error });
  },
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
  async saveTome(
    input: Partial<Tome> & Pick<Tome, "title" | "description" | "status">,
  ) {
    const existing = input.id ? await db.tomes.get(input.id) : undefined;
    const time = now();
    const tome: Tome = {
      id: existing?.id ?? uid(),
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || undefined,
      description: input.description.trim(),
      status: input.status,
      coverImage: input.coverImage,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
      archivedAt:
        input.status === "Archived"
          ? (existing?.archivedAt ?? time)
          : undefined,
    };
    if (!tome.title) throw new Error("A tome title is required.");
    await db.tomes.put(tome);
    return tome;
  },
  async deleteTome(id: string) {
    await db.transaction(
      "rw",
      db.tomes,
      db.elementTypes,
      db.elements,
      async () => {
        await db.elements.where("tomeId").equals(id).delete();
        await db.elementTypes.where("tomeId").equals(id).delete();
        await db.tomes.delete(id);
      },
    );
  },
  async createStarterTypes(tomeId: string) {
    const time = now();
    await db.elementTypes.bulkAdd(
      starterTypes.map(([name, description], i) => ({
        id: uid(),
        tomeId,
        name,
        description,
        slug: slugify(name),
        sortOrder: i,
        fieldDefinitions: [],
        createdAt: time,
        updatedAt: time,
      })),
    );
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
    await db.transaction("rw", db.elementTypes, db.elements, async () => {
      await db.elements.where("elementTypeId").equals(type.id).delete();
      await db.elementTypes.delete(type.id);
    });
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
  deleteElement(id: string) {
    return db.elements.delete(id);
  },
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
