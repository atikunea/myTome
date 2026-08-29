import Dexie from "dexie";
import { db } from "../models/db";
import type { PlotItem } from "../models/Plot";

/**
 * Shared primitives for the modules that make up `store`. Nothing here is part
 * of the public surface — it is all re-exported to the app through `store.ts`
 * or used only by its siblings in this directory.
 */

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "type";

/**
 * Guarantees the array fields a `PlotItem` reader can iterate. A schema
 * migration already backfills `writeItemIds`, but a missing array must never be
 * able to blank a page, so every read out of `plotItems` is normalized here
 * rather than trusting that every database in the wild ran every upgrade.
 */
export const readPlotItem = (item: PlotItem): PlotItem => ({
  ...item,
  attachedElementIds: item.attachedElementIds ?? [],
  writeItemIds: item.writeItemIds ?? [],
});

export const plotRange = (tomeId: string) =>
  db.plots
    .where("[tomeId+sortOrder]")
    .between([tomeId, Dexie.minKey], [tomeId, Dexie.maxKey]);
export const plotItemRange = (plotId: string) =>
  db.plotItems
    .where("[plotId+sortOrder]")
    .between([plotId, Dexie.minKey], [plotId, Dexie.maxKey]);
export const plotRowRange = (tomeId: string) =>
  db.plotRows
    .where("[tomeId+sortOrder]")
    .between([tomeId, Dexie.minKey], [tomeId, Dexie.maxKey]);

/**
 * Strips the given element ids out of every plot item that attaches them, using the
 * `*attachedElementIds` multiEntry index. Call inside a transaction that includes
 * `db.plotItems`.
 */
export const detachElements = async (elementIds: readonly string[]) => {
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
export const detachWriteItem = async (writeItemId: string) => {
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

/**
 * Assigns sortOrder = index across the given ids. Call inside a transaction.
 *
 * **Not for `plotItems`** — a beat's `sortOrder` is derived from the rank of its
 * row, never authored from an index. Use `syncPlotSortOrder` in `spine.ts`. The
 * one sanctioned exception is `deletePlotItem`, which compacts what is left of a
 * single plot after a removal that changed no row assignment.
 */
export const applyOrder = async (
  table: { update: (id: string, changes: { sortOrder: number }) => Promise<number> },
  orderedIds: string[],
) => {
  await Promise.all(
    orderedIds.map((id, index) => table.update(id, { sortOrder: index })),
  );
};
