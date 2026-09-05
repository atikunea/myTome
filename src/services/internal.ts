import Dexie, { liveQuery, type Subscription } from "dexie";
import { db } from "../models/db";
import type { PlotItem } from "../models/Plot";
import { slugify as slugValue } from "./slug";

/**
 * Shared primitives for the modules that make up `store`. Nothing here is part
 * of the public surface — it is all re-exported to the app through `store.ts`
 * or used only by its siblings in this directory.
 */

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
/** An element type's URL slug. Shares its rule with the file namers — see `slug.ts`. */
export const slugify = (s: string) => slugValue(s, "type");

/**
 * The one shape every `store.observe*` member takes: a Dexie `liveQuery` handed
 * to a callback, returning the `Subscription` `useObservable` unsubscribes.
 *
 * Errors go to the console and nowhere else, deliberately: a live query that
 * throws means the database is unreadable, which no page-level retry could help
 * with. Keeping that decision here is what stops it drifting between the
 * fourteen observers that used to spell it out one at a time.
 */
export const observe = <T>(
  query: () => T | Promise<T>,
  callback: (value: T) => void,
): Subscription =>
  liveQuery(query).subscribe({ next: callback, error: console.error });

/**
 * Whether a drag's id list still describes what is actually stored. Another tab
 * inserting or deleting mid-drag leaves the reorder talking about a set that no
 * longer exists, and writing it would scramble what is really there — so all
 * three reorder mutations drop the write rather than apply a stale order.
 */
export const sameSet = (stored: readonly string[], orderedIds: readonly string[]) =>
  stored.length === orderedIds.length && stored.every((id) => orderedIds.includes(id));

/**
 * Orders row ids by their rank on the spine. A beat whose row somehow went
 * missing sinks to the end rather than silently claiming the top of its plot.
 */
export const byRank =
  (rank: Map<string, number>) =>
  (a: string, b: string) =>
    (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER);

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
