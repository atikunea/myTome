// src/db.ts
import { Dexie, type EntityTable } from 'dexie';
import type { Element } from './Element';
import { type ElementType, initialElementTypes } from './ElementType';

export class WriteMapDB extends Dexie {
  Elements!: EntityTable<Element, 'id'>;
  ElementTypes!: EntityTable<ElementType, 'id'>;

  constructor() {
    super('WriteMapDB');

    this.version(1).stores({
      Elements: '++id, name, description, type',
      ElementTypes: '++id, name, description'
    });
  }
}

export function resetDatabase() {
  return db.transaction('rw', db.Elements, db.ElementTypes, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
    await populateElementTypes();
  });
}

export const db = new WriteMapDB();

async function populateElementTypes() {
  // Check if the table already has elements to avoid duplicates
  const count = await db.ElementTypes.count();
  if (count === 0) {
    await db.ElementTypes.bulkAdd(initialElementTypes);
  }
}

db.on("populate", populateElementTypes);
