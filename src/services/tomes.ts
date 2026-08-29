import { liveQuery } from "dexie";
import { db } from "../models/db";
import type { Tome } from "../models/Tome";
import { now, uid } from "./internal";

export const tomeStore = {
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
  /** Clears all eight tables of everything belonging to the tome. */
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
};
