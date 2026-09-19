import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { defaultWritingGoals, libraryGoalsId } from "../../models/Activity";
import { store } from "../store";
import { recordWordChange } from "../activity";
import { IDLE_MS, dayKey } from "../activityStats";
import { makeTome } from "./helpers";

/**
 * The recording half: what actually lands on the three tables, and when.
 *
 * The decisions these exercise are tested directly in `activityStats.test.ts`;
 * what is checked here is that a save carries them into the database — and, in
 * particular, that the day's figures and the word count they describe move
 * together, since that is the whole reason recording sits inside the caller's
 * transaction.
 */

const today = () => dayKey();

const write = (id: string, text: string) =>
  store.saveWriteItem({
    id,
    title: "Chapter one",
    type: "chapter",
    content: JSON.stringify({ root: { children: [], type: "root", version: 1 } }),
    preview: text,
  });

const words = (count: number) => Array.from({ length: count }, (_, i) => `w${i}`).join(" ");

/** The one day row for a tome, or undefined before anything was written. */
const dayOf = (tomeId: string, date = today()) =>
  db.writingDays.where("[tomeId+date]").equals([tomeId, date]).first();

const sessionsOf = (tomeId: string) =>
  db.writingSessions.where("tomeId").equals(tomeId).sortBy("startedAt");

/** Records a change at a chosen instant, the way a save at that moment would. */
const recordAt = (tomeId: string, delta: number, at: string, opensSession = true) =>
  db.transaction("rw", db.writingDays, db.writingSessions, () =>
    recordWordChange(tomeId, delta, { at, opensSession }),
  );

describe("recording a word change", () => {
  it("counts a save's words onto today, and opens a sitting", async () => {
    const { tome } = await makeTome();
    const item = await store.createDraftWriteItem(tome.id, "chapter");

    await write(item.id, words(120));

    const day = await dayOf(tome.id);
    expect(day).toMatchObject({ added: 120, removed: 0, net: 120, sessions: 1 });
    const sessions = await sessionsOf(tome.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ net: 120, saves: 1, date: today() });
  });

  it("records the difference, not the count, when a text is rewritten", async () => {
    const { tome } = await makeTome();
    const item = await store.createDraftWriteItem(tome.id, "chapter");

    await write(item.id, words(120));
    await write(item.id, words(200));

    // 120 then 80 more — never 320, which is what counting the text twice
    // rather than the change between the two saves would give.
    expect(await dayOf(tome.id)).toMatchObject({ added: 200, removed: 0, net: 200 });
  });

  /**
   * The case the "net change" rule exists for: a day of cutting reads negative,
   * and both halves of it are kept so the figure can be explained.
   */
  it("records a day that lost words as negative, keeping both halves", async () => {
    const { tome } = await makeTome();
    const item = await store.createDraftWriteItem(tome.id, "chapter");

    await write(item.id, words(1000));
    await write(item.id, words(300));

    expect(await dayOf(tome.id)).toMatchObject({ added: 1000, removed: 700, net: 300 });
  });

  it("does not record a draft nobody has typed into", async () => {
    const { tome } = await makeTome();
    await store.createDraftWriteItem(tome.id, "snippet");

    expect(await dayOf(tome.id)).toBeUndefined();
    expect(await sessionsOf(tome.id)).toHaveLength(0);
  });

  it("keeps the day's figure and the word count it describes in step", async () => {
    const { tome } = await makeTome();
    const item = await store.createDraftWriteItem(tome.id, "chapter");

    await write(item.id, words(42));

    const stored = await db.writeItems.get(item.id);
    expect(stored!.wordCount).toBe(42);
    expect((await dayOf(tome.id))!.net).toBe(stored!.wordCount);
  });

  it("counts each book separately", async () => {
    const { tome: one } = await makeTome();
    const { tome: two } = await makeTome();
    const first = await store.createDraftWriteItem(one.id, "chapter");
    const second = await store.createDraftWriteItem(two.id, "chapter");

    await write(first.id, words(100));
    await write(second.id, words(60));

    expect((await dayOf(one.id))!.net).toBe(100);
    expect((await dayOf(two.id))!.net).toBe(60);
    expect(await sessionsOf(one.id)).toHaveLength(1);
    expect(await sessionsOf(two.id)).toHaveLength(1);
  });
});

describe("deleting a text", () => {
  it("takes its whole count off the day, because the book got shorter", async () => {
    const { tome } = await makeTome();
    const item = await store.createDraftWriteItem(tome.id, "chapter");
    await write(item.id, words(500));

    await store.deleteWriteItem(item.id);

    expect(await dayOf(tome.id)).toMatchObject({ added: 500, removed: 500, net: 0 });
  });

  /**
   * Clearing out the Write list is not writing. The loss is recorded either way,
   * but it may only join a sitting already open — never begin one, which would
   * put an empty sitting on a day nobody wrote in.
   */
  it("joins an open sitting rather than starting one", async () => {
    const { tome } = await makeTome();
    const item = await store.createDraftWriteItem(tome.id, "chapter");
    await write(item.id, words(500));

    await store.deleteWriteItem(item.id);

    const sessions = await sessionsOf(tome.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].net).toBe(0);
  });

  it("records the loss with no sitting at all when none is open", async () => {
    const { tome } = await makeTome();
    const stale = new Date(Date.now() - IDLE_MS - 60_000).toISOString();
    await recordAt(tome.id, 500, stale);

    const item = await store.createDraftWriteItem(tome.id, "chapter");
    await db.writeItems.update(item.id, { wordCount: 500 });
    await store.deleteWriteItem(item.id);

    expect((await dayOf(tome.id))!.net).toBe(0);
    // The old sitting is untouched: it ended before this happened.
    const sessions = await sessionsOf(tome.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].net).toBe(500);
  });
});

describe("sittings", () => {
  const at = (minutes: number) =>
    new Date(new Date("2026-09-18T09:00:00.000Z").getTime() + minutes * 60_000).toISOString();

  it("extends one sitting across saves inside the idle window", async () => {
    const { tome } = await makeTome();
    await recordAt(tome.id, 100, at(0));
    await recordAt(tome.id, 150, at(9));
    await recordAt(tome.id, 50, at(17));

    const sessions = await sessionsOf(tome.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      startedAt: at(0),
      lastSaveAt: at(17),
      net: 300,
      saves: 3,
    });
  });

  it("starts a new one once the gap passes ten minutes", async () => {
    const { tome } = await makeTome();
    await recordAt(tome.id, 100, at(0));
    await recordAt(tome.id, 200, at(31));

    const sessions = await sessionsOf(tome.id);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ net: 100, lastSaveAt: at(0) });
    expect(sessions[1]).toMatchObject({ net: 200, startedAt: at(31) });
  });

  it("sums the day's writing time as the sittings' own, not the span between", async () => {
    const { tome } = await makeTome();
    await recordAt(tome.id, 100, at(0));
    await recordAt(tome.id, 100, at(8));
    // A long break, then a second sitting of six minutes.
    await recordAt(tome.id, 100, at(120));
    await recordAt(tome.id, 100, at(126));

    const day = await db.writingDays
      .where("[tomeId+date]")
      .equals([tome.id, dayKey(at(0))])
      .first();
    expect(Math.round(day!.minutes)).toBe(14);
    expect(day!.sessions).toBe(2);
  });

  it("counts a save that moved no words, because that is still writing", async () => {
    const { tome } = await makeTome();
    await recordAt(tome.id, 120, at(0));
    await recordAt(tome.id, 0, at(4));

    const sessions = await sessionsOf(tome.id);
    expect(sessions[0]).toMatchObject({ saves: 2, net: 120 });
    expect((await dayOf(tome.id, dayKey(at(0))))!.net).toBe(120);
  });

  it("keeps a sitting on the day it began when it runs past midnight", async () => {
    const { tome } = await makeTome();
    const before = new Date(2026, 8, 18, 23, 57).toISOString();
    const after = new Date(2026, 8, 19, 0, 3).toISOString();
    await recordAt(tome.id, 100, before);
    await recordAt(tome.id, 80, after);

    const sessions = await sessionsOf(tome.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].date).toBe("2026-09-18");
    // The words, though, land on the day they were written.
    expect((await dayOf(tome.id, "2026-09-18"))!.net).toBe(100);
    expect((await dayOf(tome.id, "2026-09-19"))!.net).toBe(80);
  });
});

describe("goals", () => {
  it("reads as the defaults before anything is set", async () => {
    expect(await store.readWritingGoals()).toEqual(defaultWritingGoals);
  });

  it("writes one row, whatever is saved and however often", async () => {
    await store.saveWritingGoals({ dailyWords: 1000, countedDays: [1, 2, 3, 4, 5] });
    await store.saveWritingGoals({ sessionWords: 500 });

    const rows = await db.writingGoals.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(libraryGoalsId);
    // A patch, so the second save did not revert the first.
    expect(rows[0]).toMatchObject({ dailyWords: 1000, sessionWords: 500 });
  });
});

describe("the cascade", () => {
  it("clears a deleted tome's days and sittings, and nobody else's", async () => {
    const { tome: doomed } = await makeTome();
    const { tome: kept } = await makeTome();
    const first = await store.createDraftWriteItem(doomed.id, "chapter");
    const second = await store.createDraftWriteItem(kept.id, "chapter");
    await write(first.id, words(100));
    await write(second.id, words(100));

    await store.deleteTome(doomed.id);

    expect(await db.writingDays.where("tomeId").equals(doomed.id).count()).toBe(0);
    expect(await db.writingSessions.where("tomeId").equals(doomed.id).count()).toBe(0);
    expect(await db.writingDays.where("tomeId").equals(kept.id).count()).toBe(1);
    expect(await db.writingSessions.where("tomeId").equals(kept.id).count()).toBe(1);
    // The goals are library-level and survive: they were never this book's.
    expect(await store.readWritingGoals()).toBeTruthy();
  });
});

describe("a tome's word count", () => {
  it("adds the stored counts rather than parsing the prose again", async () => {
    const { tome } = await makeTome();
    const first = await store.createDraftWriteItem(tome.id, "chapter");
    const second = await store.createDraftWriteItem(tome.id, "snippet");
    await write(first.id, words(300));
    await write(second.id, words(45));

    expect(await store.tomeWordCount(tome.id)).toBe(345);
  });
});
