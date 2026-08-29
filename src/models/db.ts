import Dexie, { type EntityTable, type Transaction } from "dexie";
import type { Tome } from "./Tome";
import type { Element } from "./Element";
import type { ElementType } from "./ElementType";
import type { Relationship } from "./Relationship";
import type { Plot, PlotItem, PlotRow } from "./Plot";
import type { WriteItem } from "./WriteItem";
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
  }
}
export const db = new MyTomeDB();
