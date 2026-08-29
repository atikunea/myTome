import { liveQuery } from "dexie";
import { db } from "../models/db";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import {
  emptyWriteItemContent,
  isBlankWriteItem,
  previewLength,
  untitledWriteItem,
} from "../models/WriteItem";
import { detachWriteItem, now, readPlotItem, uid } from "./internal";

/**
 * Prose rows, and the link between a beat and the text composed into it. That
 * link is a single array field on the beat (`writeItemIds`), so both sides of it
 * are handled here rather than split across this module and `plots.ts`.
 */
export const writeItemStore = {
  observeWriteItems(tomeId: string, callback: (v: WriteItem[]) => void) {
    return liveQuery(() =>
      db.writeItems.where("tomeId").equals(tomeId).toArray(),
    ).subscribe({ next: callback, error: console.error });
  },
  /**
   * Emits `null` for a missing row rather than `undefined`, so the editor can
   * tell "not loaded yet" (no emission) from "no such item" and avoid flashing
   * a not-found message while the first query is still in flight.
   */
  observeWriteItem(id: string, callback: (v: WriteItem | null) => void) {
    return liveQuery(async () => (await db.writeItems.get(id)) ?? null).subscribe(
      { next: callback, error: console.error },
    );
  },
  /**
   * Every plot item composing the given write item, via the `*writeItemIds`
   * multiEntry index. One-shot rather than live: the Write list already
   * re-renders on its own `observeWriteItems` tick, and this is read once per
   * story-order sort pass.
   */
  composingPlotItems(writeItemId: string) {
    return db.plotItems
      .where("writeItemIds")
      .equals(writeItemId)
      .toArray()
      .then((rows) => rows.map(readPlotItem));
  },
  /**
   * Replaces a beat's composed text, in order. A single-row write: unlike
   * `reorderPlotItems` there are no siblings to renumber, since the order lives
   * inside the array itself.
   */
  async setPlotItemWriteItems(plotItemId: string, orderedIds: string[]) {
    await db.plotItems.update(plotItemId, {
      writeItemIds: [...new Set(orderedIds)],
      updatedAt: now(),
    });
  },
  /**
   * Creates the row behind a freshly opened editor. The row exists immediately
   * so autosave has somewhere to write and the URL names something real; an
   * untouched draft is cleaned up again by `discardWriteItemIfBlank`.
   * When `plotItemId` is given the new item is appended to that beat's text.
   */
  async createDraftWriteItem(
    tomeId: string,
    type: WriteItemType,
    plotItemId?: string,
  ) {
    const time = now();
    const item: WriteItem = {
      id: uid(),
      tomeId,
      title: untitledWriteItem,
      type,
      content: emptyWriteItemContent,
      preview: "",
      createdAt: time,
      updatedAt: time,
    };
    await db.transaction("rw", db.writeItems, db.plotItems, async () => {
      await db.writeItems.add(item);
      if (!plotItemId) return;
      const beat = await db.plotItems.get(plotItemId);
      if (!beat) return;
      await db.plotItems.update(plotItemId, {
        writeItemIds: [...(beat.writeItemIds ?? []), item.id],
        updatedAt: time,
      });
    });
    return item;
  },
  /**
   * The autosave target. Deliberately unvalidated — a blank title has to be
   * allowed to persist mid-typing; the list falls back to "Untitled" for
   * display.
   */
  async saveWriteItem(
    input: Pick<WriteItem, "id" | "title" | "type" | "content" | "preview">,
  ) {
    await db.writeItems.update(input.id, {
      title: input.title,
      type: input.type,
      content: input.content,
      preview: input.preview.slice(0, previewLength),
      updatedAt: now(),
    });
  },
  /**
   * Drops a draft the author opened but never typed into, so abandoning "New"
   * leaves no "Untitled" card behind — the autosave equivalent of the plot
   * dialog's "a cancelled create writes nothing" rule.
   */
  async discardWriteItemIfBlank(id: string) {
    await db.transaction("rw", db.writeItems, db.plotItems, async () => {
      const item = await db.writeItems.get(id);
      if (!item || !isBlankWriteItem(item)) return;
      await detachWriteItem(id);
      await db.writeItems.delete(id);
    });
  },
  async deleteWriteItem(id: string) {
    await db.transaction("rw", db.writeItems, db.plotItems, async () => {
      await detachWriteItem(id);
      await db.writeItems.delete(id);
    });
  },
};
