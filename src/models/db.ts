import Dexie, { type EntityTable, type Transaction } from "dexie";
import type { Author } from "./Author";
import type { Tome } from "./Tome";
import type { Element } from "./Element";
import type { ElementType } from "./ElementType";
import type { Relationship } from "./Relationship";
import type { Plot, PlotItem, PlotRow } from "./Plot";
import type { WriteItem } from "./WriteItem";
import { elementSearchText } from "./Element";
import { asProseDocument, countDocumentWords, documentText } from "../lexical/blocks";
export interface Activity {
  id: string;
  tomeId: string;
  elementId?: string;
  action: string;
  occurredAt: string;
  summary: string;
}
/**
 * Gives every plot item the `writeItemIds` array that readers and the
 * `*writeItemIds` multiEntry index both require. Safe to run repeatedly.
 */
export const backfillWriteItemIds = (tx: Transaction) =>
  tx
    .table<PlotItem>("plotItems")
    .toCollection()
    .modify((item) => {
      item.writeItemIds ??= [];
    });
/**
 * Puts every existing beat onto a shared spine, giving each tome one ordered
 * list of `plotRows` as deep as its longest plot and assigning each plot's beats
 * to those rows by position. That reproduces the implicit index-parity the
 * side-by-side compare view already drew, which is the only alignment the old
 * data can justify — the author edits the spine from there.
 *
 * Safe to run repeatedly, and safe to resume from a half-finished run: rows are
 * topped up to the depth needed rather than recreated, and a beat that already
 * names a row is left alone.
 */
export const backfillPlotRows = async (tx: Transaction) => {
  const rowTable = tx.table<PlotRow>("plotRows");
  const itemTable = tx.table<PlotItem>("plotItems");
  const time = new Date().toISOString();
  // tomeId -> plotId -> that plot's beats, stored order.
  const byTome = new Map<string, Map<string, PlotItem[]>>();
  for (const item of await itemTable.toArray()) {
    const plots = byTome.get(item.tomeId) ?? new Map<string, PlotItem[]>();
    plots.set(item.plotId, [...(plots.get(item.plotId) ?? []), item]);
    byTome.set(item.tomeId, plots);
  }
  for (const [tomeId, plots] of byTome) {
    const lists = [...plots.values()];
    for (const list of lists) list.sort((a, b) => a.sortOrder - b.sortOrder);
    const depth = Math.max(...lists.map((list) => list.length));
    const rows = (await rowTable.where("tomeId").equals(tomeId).toArray()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    for (let i = rows.length; i < depth; i += 1) {
      const row: PlotRow = {
        id: crypto.randomUUID(),
        tomeId,
        sortOrder: i,
        createdAt: time,
        updatedAt: time,
      };
      await rowTable.add(row);
      rows.push(row);
    }
    for (const list of lists)
      for (const [i, item] of list.entries())
        if (!item.plotRowId) await itemTable.update(item.id, { plotRowId: rows[i].id });
  }
};
/**
 * Gives every prose row the `wordCount` the Write list reads straight off it.
 * Unlike the two backfills above, this one has to *parse* to find its value —
 * the count is derived from the stored Lexical document — which is the whole
 * reason the row carries it: doing this per row per render is the cost being
 * avoided.
 *
 * Safe to run repeatedly, and cheap on a second pass: a row that already holds
 * a number is skipped rather than re-parsed.
 */
export const backfillWordCounts = (tx: Transaction) =>
  tx
    .table<WriteItem>("writeItems")
    .toCollection()
    .modify((item) => {
      if (typeof item.wordCount !== "number")
        item.wordCount = countDocumentWords(item.content ?? "");
    });
/**
 * Turns every element description into a Lexical document and derives the two
 * text mirrors that replace reading it directly.
 *
 * Like v8's, this backfill has to **parse** rather than default — and unlike
 * v8's it also *converts*, since a pre-v9 description is plain text and the
 * editor can only open a document. It reads `elementTypes` because
 * `searchText` spans the custom fields too, so a migrated row and one saved
 * afterwards answer the same search; at this version no field can be `prose`
 * yet, but going through `elementSearchText` is what keeps the two writers from
 * drifting when they can.
 *
 * Safe to run repeatedly: a description that is already a document is left
 * exactly as it is, and a mirror that already exists is not recomputed.
 */
export const backfillElementProse = async (tx: Transaction) => {
  const fieldsByType = new Map<string, ElementType["fieldDefinitions"]>(
    (await tx.table<ElementType>("elementTypes").toArray()).map((type) => [
      type.id,
      type.fieldDefinitions ?? [],
    ]),
  );
  await tx
    .table<Element>("elements")
    .toCollection()
    .modify((element) => {
      element.description = asProseDocument(element.description);
      element.descriptionText ??= documentText(element.description);
      element.attributes ??= {};
      element.searchText ??= elementSearchText(
        element,
        fieldsByType.get(element.elementTypeId) ?? [],
      );
    });
};
/**
 * Turns every tome description into a Lexical document and derives the text
 * mirror the library cards read instead of it.
 *
 * v9's backfill for the other half of the app, and for the same reason: the
 * overview page edits its description in an editor now, and an editor can only
 * open a document. There is no `searchText` counterpart — the library filters
 * on title and subtitle, and a tome has no custom fields to span.
 *
 * Safe to run repeatedly: a description that is already a document is left
 * exactly as it is, and a mirror that already exists is not recomputed.
 */
export const backfillTomeProse = (tx: Transaction) =>
  tx
    .table<Tome>("tomes")
    .toCollection()
    .modify((tome) => {
      tome.description = asProseDocument(tome.description);
      tome.descriptionText ??= documentText(tome.description);
    });
export class MyTomeDB extends Dexie {
  tomes!: EntityTable<Tome, "id">;
  elements!: EntityTable<Element, "id">;
  elementTypes!: EntityTable<ElementType, "id">;
  activities!: EntityTable<Activity, "id">;
  relationships!: EntityTable<Relationship, "id">;
  plots!: EntityTable<Plot, "id">;
  plotRows!: EntityTable<PlotRow, "id">;
  plotItems!: EntityTable<PlotItem, "id">;
  writeItems!: EntityTable<WriteItem, "id">;
  authors!: EntityTable<Author, "id">;
  constructor(name = "myTomeDB") {
    super(name);
    this.version(2).stores({
      tomes: "id, status, updatedAt, title",
      elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
      elements:
        "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
      activities: "id, tomeId, [tomeId+occurredAt]",
    });
    this.version(3).stores({
      tomes: "id, status, updatedAt, title",
      elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
      elements:
        "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
      activities: "id, tomeId, [tomeId+occurredAt]",
      relationships:
        "id, tomeId, fromElementId, toElementId, [tomeId+fromElementTypeId+toElementTypeId]",
    });
    this.version(4).stores({
      tomes: "id, status, updatedAt, title",
      elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
      elements:
        "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
      activities: "id, tomeId, [tomeId+occurredAt]",
      relationships:
        "id, tomeId, fromElementId, toElementId, [tomeId+fromElementTypeId+toElementTypeId]",
      plots: "id, tomeId, [tomeId+sortOrder]",
      plotItems: "id, tomeId, plotId, [plotId+sortOrder], *attachedElementIds",
    });
    this.version(5).stores({
      tomes: "id, status, updatedAt, title",
      elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
      elements:
        "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
      activities: "id, tomeId, [tomeId+occurredAt]",
      relationships:
        "id, tomeId, fromElementId, toElementId, [tomeId+fromElementTypeId+toElementTypeId]",
      plots: "id, tomeId, [tomeId+sortOrder]",
      // `*writeItemIds` answers the reverse question — which beats compose this
      // WriteItem? — for the story-order sort and the delete cascade.
      plotItems:
        "id, tomeId, plotId, [plotId+sortOrder], *attachedElementIds, *writeItemIds",
      writeItems: "id, tomeId, [tomeId+type], [tomeId+updatedAt], title",
    })
      // Unlike the v4 bump (which introduced whole new tables), v5 adds a field
      // to an existing one, so rows written under v4 need it backfilled — the
      // multiEntry index and every reader require an array, never undefined.
      .upgrade(backfillWriteItemIds);
    // v6 repeats v5's backfill and changes nothing else. The v5 schema shipped
    // briefly without its upgrade attached, so databases opened in that window
    // are stamped v5 with un-backfilled rows, and Dexie never re-runs an
    // upgrade for a version already applied. This re-runs it for them.
    this.version(6)
      .stores({
        plotItems:
          "id, tomeId, plotId, [plotId+sortOrder], *attachedElementIds, *writeItemIds",
      })
      .upgrade(backfillWriteItemIds);
    // v7 introduces the shared story spine: `plotRows` is a new table, but
    // `plotRowId` is a new field on an existing one, so this bump needs its
    // upgrade — every reader treats the row as present, and a beat without one
    // could not be placed in the aligned grid.
    this.version(7)
      .stores({
        plotRows: "id, tomeId, [tomeId+sortOrder]",
        plotItems:
          "id, tomeId, plotId, [plotId+sortOrder], plotRowId, *attachedElementIds, *writeItemIds",
      })
      .upgrade(backfillPlotRows);
    // v8 adds `wordCount` to `writeItems` — a new field on an existing table,
    // so it needs its upgrade (rule 2). No index comes with it: the Write list
    // sorts one tome's rows in memory, and an index Dexie would have to
    // maintain on every autosave keystroke would buy nothing.
    this.version(8)
      .stores({
        writeItems: "id, tomeId, [tomeId+type], [tomeId+updatedAt], title",
      })
      .upgrade(backfillWordCounts);
    // v9 turns `Element.description` into a Lexical document and adds the
    // `descriptionText` / `searchText` mirrors beside it — new fields on an
    // existing table, so rule 2 again, and this time the upgrade has to convert
    // what is already there rather than default it. No index comes with them:
    // the list filters one type's elements in memory, and an index maintained
    // on every keystroke of an autosaving description would buy nothing.
    this.version(9)
      .stores({
        elements:
          "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
      })
      .upgrade(backfillElementProse);
    // v10 does to `Tome.description` what v9 did to the element's, and adds the
    // `descriptionText` mirror beside it — rule 2 again, converting rather than
    // defaulting. No index: the library filters on title and subtitle.
    this.version(10)
      .stores({
        tomes: "id, status, updatedAt, title",
      })
      .upgrade(backfillTomeProse);
    // v11 adds author profiles: `authors` is a new table (no upgrade — rule 2),
    // and `Tome.authorId` is a new field that needs none either, because it is
    // optional and `undefined` is exactly right for a tome nobody has credited
    // yet. Nothing reads it as an array or indexes it; the cascade on deleting
    // an author scans the tomes table, which is one row per book.
    this.version(11).stores({
      authors: "id, name",
    });
  }
}
export const db = new MyTomeDB();
