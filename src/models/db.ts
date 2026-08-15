// src/db.ts
import { Dexie, type EntityTable } from 'dexie';
import type { Tome } from './Tome';
import type { Element } from './Element';
import { type ElementType, initialElementTypes } from './ElementType';

export class myTomeDB extends Dexie {
  Tomes!: EntityTable<Tome, 'id'>;
  Elements!: EntityTable<Element, 'id'>;
  ElementTypes!: EntityTable<ElementType, 'id'>;

  constructor() {
    super('myTomeDB');

    this.version(1).stores({
      Tomes: '++id, name',
      Elements: '++id, tomeId, name, elementTypeId',
      ElementTypes: '++id, tomeId, name'
    });
  }
}

export function resetDatabase() {
  return db.transaction('rw', db.Elements, db.ElementTypes, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
    await populateElementTypes();
  });
}

export const db = new myTomeDB();

async function populateElementTypes() {
  await db.Tomes.add({ name: 'Default Tome', coverImageUrl: '', description: 'This is the default tome.' });
  await db.Tomes.add({ name: 'Default Tome 2', coverImageUrl: '', description: 'This is the default tome 2.' });
  await db.table('Tomes').toCollection().each(
    
    async (tome: Tome) => {
      console.log('Populating ElementTypes for tome:', tome.name);
      const types = initialElementTypes(tome.id);
      console.log('Initial ElementTypes:', types);
      db.ElementTypes.bulkAdd(types);
  });
}

db.on("populate", populateElementTypes);
