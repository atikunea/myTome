import { db } from "../models/db";
import type { Tome } from "../models/Tome";
import { tomeDescription } from "../models/Tome";
import { now, observe, uid } from "./internal";

/**
 * Deletes every row belonging to the tome, across all eight tables. Call inside
 * a transaction that includes them — `deleteTome` opens one, and `restoreBackup`
 * calls this inside its own to clear a tome it is about to overwrite, so the
 * cascade is written once and cannot drift between the two.
 */
export const clearTome = async (id: string) => {
  await db.writeItems.where("tomeId").equals(id).delete();
  await db.plotItems.where("tomeId").equals(id).delete();
  await db.plotRows.where("tomeId").equals(id).delete();
  await db.plots.where("tomeId").equals(id).delete();
  await db.relationships.where("tomeId").equals(id).delete();
  await db.elements.where("tomeId").equals(id).delete();
  await db.elementTypes.where("tomeId").equals(id).delete();
  await db.tomes.delete(id);
};

export const tomeStore = {
  observeTomes(callback: (v: Tome[]) => void) {
    return observe(() => db.tomes.orderBy("updatedAt").reverse().toArray(), callback);
  },
  observeTome(id: string, callback: (v: Tome | undefined) => void) {
    return observe(() => db.tomes.get(id), callback);
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
      // Wrapped rather than trimmed: the create dialog still hands over a line
      // of plain text, and so do the tests and every pre-v10 caller.
      ...tomeDescription(input.description),
      status: input.status,
      coverImage: input.coverImage,
      authorId: input.authorId || undefined,
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
  /**
   * The overview page's write: one field at a time, on the autosave debounce.
   *
   * A **patch, re-read inside the transaction**, for `updateElement`'s reason —
   * several fields on one page write to one row, and a caller merging against
   * the tome it last observed would revert the field it edited a moment ago
   * whenever a live query's echo was still in flight.
   *
   * `archivedAt` is derived here exactly as `saveTome` derives it, so archiving
   * from the overview and archiving from anywhere else date the book the same
   * day.
   */
  async updateTome(
    id: string,
    patch: Partial<
      Pick<
        Tome,
        "title" | "subtitle" | "description" | "status" | "coverImage" | "authorId"
      >
    >,
  ) {
    return db.transaction("rw", db.tomes, db.authors, async () => {
      const existing = await db.tomes.get(id);
      if (!existing) throw new Error("That tome no longer exists.");
      // Checked rather than trusted: the picker offers only live profiles, but
      // another tab can delete one between the render and the click.
      if (patch.authorId && !(await db.authors.get(patch.authorId)))
        throw new Error("That author no longer exists.");
      const merged = { ...existing, ...patch };
      const time = now();
      const tome: Tome = {
        ...merged,
        title: merged.title.trim(),
        subtitle: merged.subtitle?.trim() || undefined,
        ...tomeDescription(merged.description),
        // Blank is "no author", and has one representation.
        authorId: merged.authorId || undefined,
        updatedAt: time,
        archivedAt:
          merged.status === "Archived" ? (existing.archivedAt ?? time) : undefined,
      };
      if (!tome.title) throw new Error("A tome title is required.");
      await db.tomes.put(tome);
      return tome;
    });
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
      () => clearTome(id),
    );
  },
};
