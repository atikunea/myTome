import Dexie, { type EntityTable, type Transaction } from "dexie";
import type { Tome } from "./Tome";
import type { Element } from "./Element";
import type { ElementType } from "./ElementType";
import type { Relationship } from "./Relationship";
import type { Plot, PlotItem } from "./Plot";
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
const backfillWriteItemIds = (tx: Transaction) =>
  tx
    .table<PlotItem>("plotItems")
    .toCollection()
    .modify((item) => {
      item.writeItemIds ??= [];
    });
export class MyTomeDB extends Dexie {
  tomes!: EntityTable<Tome, "id">;
  elements!: EntityTable<Element, "id">;
  elementTypes!: EntityTable<ElementType, "id">;
  activities!: EntityTable<Activity, "id">;
  relationships!: EntityTable<Relationship, "id">;
  plots!: EntityTable<Plot, "id">;
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
  }
}
export const db = new MyTomeDB();
