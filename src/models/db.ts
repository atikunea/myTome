import Dexie, { type EntityTable } from "dexie";
import type { Tome } from "./Tome";
import type { Element } from "./Element";
import type { ElementType } from "./ElementType";
import type { Relationship } from "./Relationship";
export interface Activity {
  id: string;
  tomeId: string;
  elementId?: string;
  action: string;
  occurredAt: string;
  summary: string;
}
export class MyTomeDB extends Dexie {
  tomes!: EntityTable<Tome, "id">;
  elements!: EntityTable<Element, "id">;
  elementTypes!: EntityTable<ElementType, "id">;
  activities!: EntityTable<Activity, "id">;
  relationships!: EntityTable<Relationship, "id">;
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
  }
}
export const db = new MyTomeDB();
