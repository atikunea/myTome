import Dexie, { type EntityTable } from "dexie";
import type { Tome } from "./Tome";
import type { Element } from "./Element";
import type { ElementType } from "./ElementType";
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
  constructor(name = "myTomeDB") {
    super(name);
    this.version(2).stores({
      tomes: "id, status, updatedAt, title",
      elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
      elements:
        "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
      activities: "id, tomeId, [tomeId+occurredAt]",
    });
  }
}
export const db = new MyTomeDB();
