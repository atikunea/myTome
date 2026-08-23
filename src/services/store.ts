import Dexie, { liveQuery } from "dexie";
import { db } from "../models/db";
import type { ElementType, FieldDefinition } from "../models/ElementType";
import { tomeTemplateById } from "../models/TomeTemplate";
import { plotTemplateById } from "../models/PlotTemplate";
import type { Element } from "../models/Element";
import type { ImageSource, Tome } from "../models/Tome";
import type { Relationship } from "../models/Relationship";
import type { Plot, PlotItem, PlotRow } from "../models/Plot";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import {
  emptyWriteItemContent,
  isBlankWriteItem,
  previewLength,
  untitledWriteItem,
} from "../models/WriteItem";
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
export function validatePlotItem(title: string) {
  if (!title.trim()) throw new Error("Every plot item needs a title.");
}
export function validateRelationship(fromElementId: string, toElementId: string, label: string) {
  if (!label.trim()) throw new Error("Every relationship needs a description.");
  if (fromElementId === toElementId)
    throw new Error("An element cannot be related to itself.");
}
/**
 * Guarantees the array fields a `PlotItem` reader can iterate. A schema
 * migration already backfills `writeItemIds`, but a missing array must never be
 * able to blank a page, so every read out of `plotItems` is normalized here
 * rather than trusting that every database in the wild ran every upgrade.
 */
const readPlotItem = (item: PlotItem): PlotItem => ({
  ...item,
  attachedElementIds: item.attachedElementIds ?? [],
  writeItemIds: item.writeItemIds ?? [],
});
const plotRange = (tomeId: string) =>
  db.plots
    .where("[tomeId+sortOrder]")
    .between([tomeId, Dexie.minKey], [tomeId, Dexie.maxKey]);
const plotItemRange = (plotId: string) =>
  db.plotItems
    .where("[plotId+sortOrder]")
    .between([plotId, Dexie.minKey], [plotId, Dexie.maxKey]);
const plotRowRange = (tomeId: string) =>
  db.plotRows
    .where("[tomeId+sortOrder]")
    .between([tomeId, Dexie.minKey], [tomeId, Dexie.maxKey]);
/**
 * Grows a tome's spine by `count` rows at the end. Call inside a transaction
 * that includes `db.plotRows`.
 */
const appendPlotRows = async (tomeId: string, count: number) => {
  const time = now();
  const start = await plotRowRange(tomeId).count();
  const rows: PlotRow[] = Array.from({ length: count }, (_, i) => ({
    id: uid(),
    tomeId,
    sortOrder: start + i,
    createdAt: time,
    updatedAt: time,
  }));
  await db.plotRows.bulkAdd(rows);
  return rows;
};
/**
 * Opens a gap in the spine at `index` and returns the new empty row. Every plot's
 * beats keep the rows they already name, so pushing the tail down moves all of
 * them together and the alignment across plots is preserved.
 */
const insertPlotRowAt = async (tomeId: string, index: number) => {
  const time = now();
  const rows = await plotRowRange(tomeId).toArray();
  const at = Math.min(Math.max(index, 0), rows.length);
  await Promise.all(
    rows
      .slice(at)
      .map((row, i) =>
        db.plotRows.update(row.id, { sortOrder: at + i + 1, updatedAt: time }),
      ),
  );
  const row: PlotRow = {
    id: uid(),
    tomeId,
    sortOrder: at,
    createdAt: time,
    updatedAt: time,
  };
  await db.plotRows.add(row);
  return row;
};
/**
 * The spine row a new beat should take. A beat inserted between two others opens
 * a fresh row just above the one it displaces; a beat appended to the end reuses
 * the next row this plot leaves empty and only grows the spine when there is
 * none — so writing straight down a single plot does not strand its beats below
 * everyone else's. Call inside a transaction covering `db.plotRows` and
 * `db.plotItems`.
 */
const rowForNewPlotItem = async (tomeId: string, plotId: string, at: number) => {
  const rows = await plotRowRange(tomeId).toArray();
  const siblings = await plotItemRange(plotId).toArray();
  if (at < siblings.length) {
    const displaced = rows.findIndex((row) => row.id === siblings[at].plotRowId);
    return insertPlotRowAt(tomeId, displaced < 0 ? rows.length : displaced);
  }
  const held = new Set(siblings.map((item) => item.plotRowId));
  const lastHeld = rows.reduce((last, row, i) => (held.has(row.id) ? i : last), -1);
  // Everything past the plot's last beat is free by definition, so the next row
  // is either there for the taking or the spine has run out.
  return rows[lastHeld + 1] ?? (await appendPlotRows(tomeId, 1))[0];
};
/**
 * Rewrites every beat's `sortOrder` in a tome from the order of the rows they
 * stand on, which is the truth — `sortOrder` is a cache of it, kept so that the
 * `[plotId+sortOrder]` index and every single-plot reader keep working unchanged.
 *
 * End every mutation that touches rows or row assignments with this, inside its
 * transaction. It writes only the rows that actually move, so calling it after a
 * change that reordered nothing costs one read and fires no live query.
 */
const syncPlotSortOrder = async (tomeId: string) => {
  const rows = await plotRowRange(tomeId).toArray();
  const rank = new Map(rows.map((row, index) => [row.id, index]));
  const byPlot = new Map<string, PlotItem[]>();
  for (const item of await db.plotItems.where("tomeId").equals(tomeId).toArray())
    byPlot.set(item.plotId, [...(byPlot.get(item.plotId) ?? []), item]);
  const writes: Promise<number>[] = [];
  for (const list of byPlot.values()) {
    // A beat whose row somehow went missing sinks to the end rather than
    // silently claiming the top of its plot.
    list.sort(
      (a, b) =>
        (rank.get(a.plotRowId) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.plotRowId) ?? Number.MAX_SAFE_INTEGER),
    );
    list.forEach((item, index) => {
      if (item.sortOrder !== index)
        writes.push(db.plotItems.update(item.id, { sortOrder: index }));
    });
  }
  await Promise.all(writes);
};
/**
 * Strips the given element ids out of every plot item that attaches them, using the
 * `*attachedElementIds` multiEntry index. Call inside a transaction that includes
 * `db.plotItems`.
 */
const detachElements = async (elementIds: readonly string[]) => {
  const time = now();
  for (const elementId of elementIds)
    await db.plotItems
      .where("attachedElementIds")
      .equals(elementId)
      .modify((item) => {
        item.attachedElementIds = item.attachedElementIds.filter(
          (x) => x !== elementId,
        );
        item.updatedAt = time;
      });
};
/**
 * Strips the given write item id out of every plot item that composes it, using
 * the `*writeItemIds` multiEntry index. Removal is a splice, not a renumber —
 * order lives entirely inside the one array field. Call inside a transaction
 * that includes `db.plotItems`.
 */
const detachWriteItem = async (writeItemId: string) => {
  const time = now();
  await db.plotItems
    .where("writeItemIds")
    .equals(writeItemId)
    .modify((item) => {
      item.writeItemIds = (item.writeItemIds ?? []).filter(
        (x) => x !== writeItemId,
      );
      item.updatedAt = time;
    });
};
/** Assigns sortOrder = index across the given ids. Call inside a transaction. */
const applyOrder = async (
  table: { update: (id: string, changes: { sortOrder: number }) => Promise<number> },
  orderedIds: string[],
) => {
  await Promise.all(
    orderedIds.map((id, index) => table.update(id, { sortOrder: index })),
  );
};
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
      [
        db.tomes,
        db.elementTypes,
        db.elements,
        db.relationships,
        db.plots,
        db.plotRows,
        db.plotItems,
        db.writeItems,
      ],
      async () => {
        await db.writeItems.where("tomeId").equals(id).delete();
        await db.plotItems.where("tomeId").equals(id).delete();
        await db.plotRows.where("tomeId").equals(id).delete();
        await db.plots.where("tomeId").equals(id).delete();
        await db.relationships.where("tomeId").equals(id).delete();
        await db.elements.where("tomeId").equals(id).delete();
        await db.elementTypes.where("tomeId").equals(id).delete();
        await db.tomes.delete(id);
      },
    );
  },
  /**
   * Seeds a brand-new tome from a template: its element types (with their field
   * definitions) and, for every template but "General", a starter plot outline.
   * Only ever called on a tome that has just been created — it adds rows and
   * never reconciles, so applying a second template would stack the two.
   */
  async applyTomeTemplate(tomeId: string, templateId: string) {
    const template = tomeTemplateById(templateId);
    const time = now();
    await db.transaction("rw", db.elementTypes, async () => {
      await db.elementTypes.bulkAdd(
        template.types.map((type, i) => ({
          id: uid(),
          tomeId,
          name: type.name,
          description: type.description,
          icon: type.icon,
          slug: slugify(type.name),
          sortOrder: i,
          fieldDefinitions: (type.fields ?? []).map((field, position) => ({
            id: uid(),
            name: field.name,
            kind: field.kind,
            options: field.options,
            // A template never demands a value: an author sketching a character
            // should not be blocked by a field the template chose for them.
            required: false,
            sortOrder: position,
          })),
          createdAt: time,
          updatedAt: time,
        })),
      );
    });
  },
  /**
   * Creates a plot line from a named story structure, beats and all.
   *
   * Like `applyTomeTemplate` this only ever adds rows, so it is a create-time
   * operation: call it for a plot that does not exist yet, never to re-apply a
   * structure over one the author has already written into. An unknown id (or
   * `noPlotTemplateId`) creates a plain empty plot, which is what the picker's
   * "No plot line" option relies on.
   */
  async createPlotFromTemplate(
    tomeId: string,
    plotTemplateId: string,
    overrides?: { name?: string; description?: string },
  ) {
    const template = plotTemplateById(plotTemplateId);
    const name = overrides?.name?.trim() || template?.name || "Main Plot";
    const time = now();
    return db.transaction("rw", db.plots, db.plotRows, db.plotItems, async () => {
      const plot = await store.savePlot({
        tomeId,
        name,
        description: overrides?.description,
      });
      if (!template) return plot;
      // The template's beats fill the spine from the top rather than queueing
      // after it, so a subplot added to a tome that already has an outline lines
      // up with its opening. Only a template deeper than the spine extends it.
      const rows = await plotRowRange(tomeId).toArray();
      if (template.beats.length > rows.length)
        rows.push(...(await appendPlotRows(tomeId, template.beats.length - rows.length)));
      await db.plotItems.bulkAdd(
        template.beats.map((beat, i) => ({
          id: uid(),
          tomeId,
          plotId: plot.id,
          name: beat.name,
          title: beat.title,
          description: beat.description,
          dotColor: beat.dotColor ?? "grey",
          dotVariant: "outlined" as const,
          attachedElementIds: [],
          writeItemIds: [],
          plotRowId: rows[i].id,
          sortOrder: i,
          createdAt: time,
          updatedAt: time,
        })),
      );
      return plot;
    });
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
  observePlots(tomeId: string, callback: (v: Plot[]) => void) {
    return liveQuery(() => plotRange(tomeId).toArray()).subscribe({
      next: callback,
      error: console.error,
    });
  },
  observePlot(id: string, callback: (v: Plot | undefined) => void) {
    return liveQuery(() => db.plots.get(id)).subscribe({
      next: callback,
      error: console.error,
    });
  },
  observePlotItems(plotId: string, callback: (v: PlotItem[]) => void) {
    return liveQuery(() =>
      plotItemRange(plotId).toArray().then((rows) => rows.map(readPlotItem)),
    ).subscribe({ next: callback, error: console.error });
  },
  async ensureDefaultPlot(tomeId: string) {
    const existing = await plotRange(tomeId).first();
    if (existing) return existing;
    return store.savePlot({ tomeId, name: "Main Plot" });
  },
  async savePlot(input: Partial<Plot> & Pick<Plot, "tomeId" | "name">) {
    const existing = input.id ? await db.plots.get(input.id) : undefined;
    const time = now();
    const plot: Plot = {
      id: existing?.id ?? uid(),
      tomeId: input.tomeId,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      sortOrder:
        input.sortOrder ??
        existing?.sortOrder ??
        (await db.plots.where("tomeId").equals(input.tomeId).count()),
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
    };
    if (!plot.name) throw new Error("A plot name is required.");
    await db.plots.put(plot);
    return plot;
  },
  async reorderPlots(tomeId: string, orderedIds: string[]) {
    await db.transaction("rw", db.plots, async () => {
      const stored = await plotRange(tomeId).primaryKeys();
      // A mismatch means another tab added or deleted a plot while this drag was
      // in flight — drop the reorder rather than write a stale order.
      if (
        stored.length !== orderedIds.length ||
        !stored.every((id) => orderedIds.includes(id))
      )
        return;
      await applyOrder(db.plots, orderedIds);
    });
  },
  async deletePlot(plot: Pick<Plot, "id" | "tomeId">) {
    await db.transaction("rw", db.plots, db.plotItems, async () => {
      await db.plotItems.where("plotId").equals(plot.id).delete();
      await db.plots.delete(plot.id);
      const remaining = await plotRange(plot.tomeId).primaryKeys();
      await applyOrder(db.plots, remaining);
    });
  },
  async savePlotItem(
    input: Partial<PlotItem> &
      Pick<PlotItem, "tomeId" | "plotId" | "name" | "title" | "description">,
    insertAt?: number,
  ) {
    validatePlotItem(input.title);
    const existing = input.id ? await db.plotItems.get(input.id) : undefined;
    const time = now();
    const item: PlotItem = {
      id: existing?.id ?? uid(),
      tomeId: input.tomeId,
      plotId: input.plotId,
      name: input.name.trim(),
      title: input.title.trim(),
      description: input.description.trim(),
      icon: input.icon,
      dotColor: input.dotColor,
      dotVariant: input.dotVariant,
      attachedElementIds: [
        ...new Set(input.attachedElementIds ?? existing?.attachedElementIds ?? []),
      ],
      writeItemIds: [
        ...new Set(input.writeItemIds ?? existing?.writeItemIds ?? []),
      ],
      // Like `sortOrder`, a new beat's row is settled inside the transaction —
      // choosing one means reading the tome's spine. A caller may name the row
      // itself (the compare grid's empty cells do), and an edit keeps its own.
      plotRowId: input.plotRowId ?? existing?.plotRowId ?? "",
      sortOrder: existing?.sortOrder ?? 0,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time,
    };
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      if (existing) {
        await db.plotItems.put(item);
        return;
      }
      const ids = await plotItemRange(item.plotId).primaryKeys();
      const at = Math.min(Math.max(insertAt ?? ids.length, 0), ids.length);
      ids.splice(at, 0, item.id);
      item.sortOrder = at;
      if (!item.plotRowId)
        item.plotRowId = (await rowForNewPlotItem(item.tomeId, item.plotId, at)).id;
      await db.plotItems.put(item);
      await applyOrder(db.plotItems, ids);
    });
    return item;
  },
  /**
   * Reorders one plot's beats among themselves. Since row order is what ordering
   * means now, this permutes which of the plot's beats stands on each of the rows
   * it already occupies rather than renumbering `sortOrder` directly. The set of
   * occupied rows is unchanged, so every other plot in the tome keeps its
   * alignment and no gap opens or closes anywhere else.
   */
  async reorderPlotItems(plotId: string, orderedIds: string[]) {
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const stored = await plotItemRange(plotId).toArray();
      // A mismatch means another tab inserted or deleted an item while this drag
      // was in flight — drop the reorder rather than write a stale order.
      if (
        stored.length !== orderedIds.length ||
        !stored.every((item) => orderedIds.includes(item.id))
      )
        return;
      if (!stored.length) return;
      const rows = await plotRowRange(stored[0].tomeId).toArray();
      const rank = new Map(rows.map((row, index) => [row.id, index]));
      const held = stored
        .map((item) => item.plotRowId)
        .sort(
          (a, b) =>
            (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
        );
      await Promise.all(
        orderedIds.map((id, index) =>
          db.plotItems.update(id, { plotRowId: held[index], sortOrder: index }),
        ),
      );
    });
  },
  async deletePlotItem(item: Pick<PlotItem, "id" | "plotId">) {
    await db.transaction("rw", db.plotItems, async () => {
      await db.plotItems.delete(item.id);
      const remaining = await plotItemRange(item.plotId).primaryKeys();
      await applyOrder(db.plotItems, remaining);
    });
  },
  /** The tome's shared spine, in order — the row axis every plot is drawn against. */
  observePlotRows(tomeId: string, callback: (v: PlotRow[]) => void) {
    return liveQuery(() => plotRowRange(tomeId).toArray()).subscribe({
      next: callback,
      error: console.error,
    });
  },
  /**
   * Opens an empty row at `index`, pushing the rest of the spine down. Every beat
   * keeps the row it already names, so all of them shift together and nothing
   * loses the beat it was aligned against.
   */
  async insertPlotRow(tomeId: string, index: number) {
    return db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const row = await insertPlotRowAt(tomeId, index);
      await syncPlotSortOrder(tomeId);
      return row;
    });
  },
  /** Names a row, or clears the name when given blank text. */
  async setPlotRowLabel(rowId: string, label: string) {
    await db.plotRows.update(rowId, {
      label: label.trim() || undefined,
      updatedAt: now(),
    });
  },
  /**
   * What a row is holding, across every plot in the tome. `deletePlotRow` takes
   * all of it, so the confirm dialog asks with these numbers in hand.
   */
  async countPlotRowBeats(rowId: string) {
    const items = await db.plotItems.where("plotRowId").equals(rowId).toArray();
    return { beats: items.length, plots: new Set(items.map((item) => item.plotId)).size };
  },
  /**
   * Deletes a row and every beat standing on it. Unlike the rest of the plot
   * mutations this reaches across plots, which is why it is destructive enough to
   * confirm first — see `countPlotRowBeats`.
   */
  async deletePlotRow(row: Pick<PlotRow, "id" | "tomeId">) {
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      await db.plotItems.where("plotRowId").equals(row.id).delete();
      await db.plotRows.delete(row.id);
      await applyOrder(db.plotRows, await plotRowRange(row.tomeId).primaryKeys());
      await syncPlotSortOrder(row.tomeId);
    });
  },
  async reorderPlotRows(tomeId: string, orderedIds: string[]) {
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const stored = await plotRowRange(tomeId).primaryKeys();
      // The same stale-drag guard `reorderPlotItems` uses: another tab changed the
      // spine mid-drag, so this order is about a set that no longer exists.
      if (
        stored.length !== orderedIds.length ||
        !stored.every((id) => orderedIds.includes(id))
      )
        return;
      await applyOrder(db.plotRows, orderedIds);
      await syncPlotSortOrder(tomeId);
    });
  },
  /**
   * Moves a beat onto another row of its tome's spine — the compare grid's drop.
   * Landing on a row that already holds one of the same plot's beats swaps the
   * two: a plot can only have one beat per row, because a grid cell can only draw
   * one card.
   */
  async movePlotItemToRow(itemId: string, plotRowId: string) {
    await db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const item = await db.plotItems.get(itemId);
      const row = await db.plotRows.get(plotRowId);
      // A stale drop: the beat or the row went away in another tab, or the drag
      // ended where it started.
      if (!item || !row || row.tomeId !== item.tomeId || item.plotRowId === plotRowId)
        return;
      const time = now();
      const displaced = await db.plotItems
        .where("plotRowId")
        .equals(plotRowId)
        .filter((other) => other.plotId === item.plotId)
        .first();
      if (displaced)
        await db.plotItems.update(displaced.id, {
          plotRowId: item.plotRowId,
          updatedAt: time,
        });
      await db.plotItems.update(itemId, { plotRowId, updatedAt: time });
      await syncPlotSortOrder(item.tomeId);
    });
  },
  /**
   * Drops every row no plot has a beat on, and reports how many went. The spine
   * only ever grows as beats are inserted, and deleting a beat leaves its row
   * standing, so this is the housekeeping that keeps a long tome's grid from
   * filling up with dead slots.
   */
  async removeEmptyPlotRows(tomeId: string) {
    return db.transaction("rw", db.plotRows, db.plotItems, async () => {
      const rows = await plotRowRange(tomeId).toArray();
      const held = new Set(
        (await db.plotItems.where("tomeId").equals(tomeId).toArray()).map(
          (item) => item.plotRowId,
        ),
      );
      const empty = rows.filter((row) => !held.has(row.id));
      if (!empty.length) return 0;
      await db.plotRows.bulkDelete(empty.map((row) => row.id));
      await applyOrder(
        db.plotRows,
        rows.filter((row) => held.has(row.id)).map((row) => row.id),
      );
      await syncPlotSortOrder(tomeId);
      return empty.length;
    });
  },
  /**
   * Replaces a beat's composed text, in order. A single-row write: unlike
   * `reorderPlotItems` there are no siblings to renumber, since the order lives
   * inside the array itself.
   */
  async setPlotItemWriteItems(plotItemId: string, orderedIds: string[]) {
    await db.plotItems.update(plotItemId, {
      writeItemIds: [...new Set(orderedIds)],
      updatedAt: now(),
    });
  },
  /**
   * Every beat in the tome, across all its plots — the Write list needs them in
   * one pass to resolve story order, rather than one query per write item.
   */
  observeTomePlotItems(tomeId: string, callback: (v: PlotItem[]) => void) {
    return liveQuery(() =>
      db.plotItems
        .where("tomeId")
        .equals(tomeId)
        .toArray()
        .then((rows) => rows.map(readPlotItem)),
    ).subscribe({ next: callback, error: console.error });
  },
  observeWriteItems(tomeId: string, callback: (v: WriteItem[]) => void) {
    return liveQuery(() =>
      db.writeItems.where("tomeId").equals(tomeId).toArray(),
    ).subscribe({ next: callback, error: console.error });
  },
  /**
   * Emits `null` for a missing row rather than `undefined`, so the editor can
   * tell "not loaded yet" (no emission) from "no such item" and avoid flashing
   * a not-found message while the first query is still in flight.
   */
  observeWriteItem(id: string, callback: (v: WriteItem | null) => void) {
    return liveQuery(async () => (await db.writeItems.get(id)) ?? null).subscribe(
      { next: callback, error: console.error },
    );
  },
  /**
   * Every plot item composing the given write item, via the `*writeItemIds`
   * multiEntry index. One-shot rather than live: the Write list already
   * re-renders on its own `observeWriteItems` tick, and this is read once per
   * story-order sort pass.
   */
  composingPlotItems(writeItemId: string) {
    return db.plotItems
      .where("writeItemIds")
      .equals(writeItemId)
      .toArray()
      .then((rows) => rows.map(readPlotItem));
  },
  /**
   * Creates the row behind a freshly opened editor. The row exists immediately
   * so autosave has somewhere to write and the URL names something real; an
   * untouched draft is cleaned up again by `discardWriteItemIfBlank`.
   * When `plotItemId` is given the new item is appended to that beat's text.
   */
  async createDraftWriteItem(
    tomeId: string,
    type: WriteItemType,
    plotItemId?: string,
  ) {
    const time = now();
    const item: WriteItem = {
      id: uid(),
      tomeId,
      title: untitledWriteItem,
      type,
      content: emptyWriteItemContent,
      preview: "",
      createdAt: time,
      updatedAt: time,
    };
    await db.transaction("rw", db.writeItems, db.plotItems, async () => {
      await db.writeItems.add(item);
      if (!plotItemId) return;
      const beat = await db.plotItems.get(plotItemId);
      if (!beat) return;
      await db.plotItems.update(plotItemId, {
        writeItemIds: [...(beat.writeItemIds ?? []), item.id],
        updatedAt: time,
      });
    });
    return item;
  },
  /**
   * The autosave target. Deliberately unvalidated — a blank title has to be
   * allowed to persist mid-typing; the list falls back to "Untitled" for
   * display.
   */
  async saveWriteItem(
    input: Pick<WriteItem, "id" | "title" | "type" | "content" | "preview">,
  ) {
    await db.writeItems.update(input.id, {
      title: input.title,
      type: input.type,
      content: input.content,
      preview: input.preview.slice(0, previewLength),
      updatedAt: now(),
    });
  },
  /**
   * Drops a draft the author opened but never typed into, so abandoning "New"
   * leaves no "Untitled" card behind — the autosave equivalent of the plot
   * dialog's "a cancelled create writes nothing" rule.
   */
  async discardWriteItemIfBlank(id: string) {
    await db.transaction("rw", db.writeItems, db.plotItems, async () => {
      const item = await db.writeItems.get(id);
      if (!item || !isBlankWriteItem(item)) return;
      await detachWriteItem(id);
      await db.writeItems.delete(id);
    });
  },
  async deleteWriteItem(id: string) {
    await db.transaction("rw", db.writeItems, db.plotItems, async () => {
      await detachWriteItem(id);
      await db.writeItems.delete(id);
    });
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
