import { db } from "../models/db";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import {
  emptyWriteItemContent,
  isBlankWriteItem,
  previewLength,
  untitledWriteItem,
} from "../models/WriteItem";
import { countWords } from "../lexical/blocks";
import { recordWordChange } from "./activity";
import { detachWriteItem, now, observe, readPlotItem, uid } from "./internal";

/**
 * Prose rows, and the link between a beat and the text composed into it. That
 * link is a single array field on the beat (`writeItemIds`), so both sides of it
 * are handled here rather than split across this module and `plots.ts`.
 */
export const writeItemStore = {
  observeWriteItems(tomeId: string, callback: (v: WriteItem[]) => void) {
    return observe(
      () => db.writeItems.where("tomeId").equals(tomeId).toArray(),
      callback,
    );
  },
  /**
   * Emits `null` for a missing row rather than `undefined`, so the editor can
   * tell "not loaded yet" (no emission) from "no such item" and avoid flashing
   * a not-found message while the first query is still in flight.
   */
  observeWriteItem(id: string, callback: (v: WriteItem | null) => void) {
    return observe(async () => (await db.writeItems.get(id)) ?? null, callback);
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
   *
   * Nothing is recorded for the activity tracker here: a fresh draft holds no
   * words, so there is no difference to record, and opening a sitting for a
   * click that typed nothing would put an empty session on the day.
   *
   * When `plotItemId` is given the new item joins that beat's text: at `at` in
   * its reading order, or appended when that is omitted or out of range. The
   * position is applied inside the same transaction as the create, so a section
   * added part-way up a beat never appears at the bottom for a frame first.
   */
  async createDraftWriteItem(
    tomeId: string,
    type: WriteItemType,
    plotItemId?: string,
    at?: number,
  ) {
    const time = now();
    const item: WriteItem = {
      id: uid(),
      tomeId,
      title: untitledWriteItem,
      type,
      content: emptyWriteItemContent,
      preview: "",
      wordCount: 0,
      createdAt: time,
      updatedAt: time,
    };
    await db.transaction("rw", db.writeItems, db.plotItems, async () => {
      await db.writeItems.add(item);
      if (!plotItemId) return;
      const beat = await db.plotItems.get(plotItemId);
      if (!beat) return;
      const ids = [...(beat.writeItemIds ?? [])];
      ids.splice(at === undefined ? ids.length : Math.min(Math.max(at, 0), ids.length), 0, item.id);
      await db.plotItems.update(plotItemId, { writeItemIds: ids, updatedAt: time });
    });
    return item;
  },
  /**
   * The autosave target. Deliberately unvalidated — a blank title has to be
   * allowed to persist mid-typing; the list falls back to "Untitled" for
   * display.
   *
   * It re-reads the row inside the transaction for the count it is replacing,
   * because the activity tracker records a *difference* and there is nowhere
   * else that difference exists. Recording in the same transaction is the whole
   * guarantee: the day's figure and the word count it describes commit together
   * or not at all.
   */
  async saveWriteItem(
    input: Pick<WriteItem, "id" | "title" | "type" | "content" | "preview">,
  ) {
    const time = now();
    // Counted from the *untruncated* text the editor sent, before `preview` is
    // cut to its 240 characters: the caller hands over the whole document as
    // plain text already, so the count costs a split rather than a parse.
    const wordCount = countWords(input.preview);
    await db.transaction(
      "rw",
      db.writeItems,
      db.writingDays,
      db.writingSessions,
      async () => {
        const before = await db.writeItems.get(input.id);
        if (!before) return;
        await db.writeItems.update(input.id, {
          title: input.title,
          type: input.type,
          content: input.content,
          preview: input.preview.slice(0, previewLength),
          wordCount,
          updatedAt: time,
        });
        await recordWordChange(before.tomeId, wordCount - (before.wordCount ?? 0), {
          at: time,
        });
      },
    );
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
  /**
   * Deleting a text takes its whole word count off the day, because the day's
   * figure is a claim about how long the book is and the book did get shorter.
   * It does **not** open a sitting: clearing out the Write list is not writing,
   * so the loss joins a sitting already in progress or stands alone on the day.
   */
  async deleteWriteItem(id: string) {
    await db.transaction(
      "rw",
      [db.writeItems, db.plotItems, db.writingDays, db.writingSessions],
      async () => {
        const item = await db.writeItems.get(id);
        await detachWriteItem(id);
        await db.writeItems.delete(id);
        if (item?.wordCount)
          await recordWordChange(item.tomeId, -item.wordCount, { opensSession: false });
      },
    );
  },
};
