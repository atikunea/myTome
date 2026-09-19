import Dexie from "dexie";
import { db } from "../models/db";
import type { WritingDay, WritingGoals, WritingSession } from "../models/Activity";
import { defaultWritingGoals, libraryGoalsId } from "../models/Activity";
import { continuesSession, dayKey } from "./activityStats";
import { now, observe, uid } from "./internal";

/**
 * The activity tracker's three tables, and the only writer of any of them.
 *
 * **Nothing here is authored except the goals.** A day's figures are recorded by
 * {@link recordWordChange}, which `writeItems.ts` calls **inside its own
 * transaction** as part of the same write that moved `WriteItem.wordCount`. That
 * is not tidiness: if the count commits and the activity does not, the tracker
 * is lying by exactly the size of the crash, and nothing would ever tell the
 * author which day was wrong. For the same reason `recordWordChange` is not on
 * `store` — it is never called from a page.
 *
 * **Sessions close by arithmetic, not by a clock.** There is no timer, no
 * heartbeat and no `unload` handler: a save either continues the tome's most
 * recent sitting or begins the next one, so a tab killed mid-sentence leaves a
 * sitting whose last save is its end — which is exactly right, and which a
 * timer in a throttled background tab could never have written.
 *
 * The decisions themselves — what continues a sitting, what a streak survives,
 * where a deadline lands — are in `activityStats.ts`, which reads no table.
 */

/** Every row of both per-tome tables. Call inside a transaction that lists them. */
export const clearTomeActivity = async (tomeId: string) => {
  await db.writingDays.where("tomeId").equals(tomeId).delete();
  await db.writingSessions.where("tomeId").equals(tomeId).delete();
};

/** The sitting a save might continue: this tome's most recent, by its last save. */
const latestSession = (tomeId: string) =>
  db.writingSessions
    .where("[tomeId+lastSaveAt]")
    .between([tomeId, Dexie.minKey], [tomeId, Dexie.maxKey])
    .last();

/** The row for one tome's date, created empty if this is the day's first save. */
const dayRow = async (tomeId: string, date: string, at: string): Promise<WritingDay> => {
  const existing = await db.writingDays.where("[tomeId+date]").equals([tomeId, date]).first();
  if (existing) return existing;
  return {
    id: uid(),
    tomeId,
    date,
    added: 0,
    removed: 0,
    net: 0,
    sessions: 0,
    minutes: 0,
    createdAt: at,
    updatedAt: at,
  };
};

/**
 * Records one change to a tome's word count.
 *
 * `delta` is `after − before` for the text that was just written: positive when
 * the book got longer, negative when it got shorter, and zero for a save that
 * only moved punctuation around — which still counts as writing, so it still
 * extends the sitting and its minutes.
 *
 * `opensSession` is the difference between writing and housekeeping. A save from
 * the editor may begin a new sitting; deleting a text from the Write list may
 * only join one that is already open. Either way the day's figures move, because
 * the day is a claim about the book's length and the book did get shorter.
 *
 * Call inside a transaction that includes `writingDays` and `writingSessions`.
 */
export const recordWordChange = async (
  tomeId: string,
  delta: number,
  options: { at?: string; opensSession?: boolean } = {},
) => {
  const at = options.at ?? now();
  const opensSession = options.opensSession ?? true;
  const date = dayKey(at);
  const added = delta > 0 ? delta : 0;
  const removed = delta < 0 ? -delta : 0;

  const open = await latestSession(tomeId);
  const joins = open && continuesSession(open.lastSaveAt, at);
  // Telescopes to (last save − first save) across the sitting, so the day's
  // minutes are the sum of its sittings' writing time without re-reading them.
  let minutes = 0;
  let startedSession = 0;

  if (joins) {
    minutes = Math.max(0, (new Date(at).getTime() - new Date(open.lastSaveAt).getTime()) / 60_000);
    await db.writingSessions.update(open.id, {
      lastSaveAt: at,
      added: open.added + added,
      removed: open.removed + removed,
      net: open.net + delta,
      saves: open.saves + 1,
    });
  } else if (opensSession) {
    startedSession = 1;
    const session: WritingSession = {
      id: uid(),
      tomeId,
      date,
      startedAt: at,
      lastSaveAt: at,
      added,
      removed,
      net: delta,
      saves: 1,
    };
    await db.writingSessions.add(session);
  }

  const day = await dayRow(tomeId, date, at);
  await db.writingDays.put({
    ...day,
    added: day.added + added,
    removed: day.removed + removed,
    net: day.net + delta,
    sessions: day.sessions + startedSession,
    minutes: day.minutes + minutes,
    updatedAt: at,
  });
};

export const activityStore = {
  /**
   * Every day this tome has been written in. The whole record rather than a
   * window: the calendar draws the book's entire life, and one row per day is
   * a few hundred rows for a book that took two years.
   */
  observeWritingDays(tomeId: string, callback: (v: WritingDay[]) => void) {
    return observe(
      () =>
        db.writingDays
          .where("[tomeId+date]")
          .between([tomeId, Dexie.minKey], [tomeId, Dexie.maxKey])
          .toArray(),
      callback,
    );
  },
  /**
   * Every book's days from `from` onwards, for the library page. This is what
   * the bare `date` index exists for — the one question that crosses tomes.
   */
  observeLibraryDays(from: string, callback: (v: WritingDay[]) => void) {
    return observe(
      () => db.writingDays.where("date").aboveOrEqual(from).toArray(),
      callback,
    );
  },
  /** One day's sittings for one tome, oldest first — the order they happened. */
  observeWritingSessions(
    tomeId: string,
    date: string,
    callback: (v: WritingSession[]) => void,
  ) {
    return observe(
      async () =>
        (await db.writingSessions.where("[tomeId+date]").equals([tomeId, date]).toArray()).sort(
          (a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0),
        ),
      callback,
    );
  },
  /**
   * The library's goals, defaulted rather than absent. A page should never have
   * to tell "not loaded yet" from "never set": until the author sets one the
   * goal is zero, which the UI reads as having nothing to say yet.
   */
  observeWritingGoals(callback: (v: WritingGoals) => void) {
    return observe(
      async () => (await db.writingGoals.get(libraryGoalsId)) ?? defaultWritingGoals,
      callback,
    );
  },
  /** One-shot read of the goals, for a caller that is not rendering. */
  async readWritingGoals(): Promise<WritingGoals> {
    return (await db.writingGoals.get(libraryGoalsId)) ?? defaultWritingGoals;
  },
  /**
   * Writes the one goals row. A patch, like every other autosaving surface in
   * the app: the dialog edits one field at a time and must not revert the
   * others it is not showing.
   */
  async saveWritingGoals(patch: Partial<Omit<WritingGoals, "id" | "updatedAt">>) {
    return db.transaction("rw", db.writingGoals, async () => {
      const existing = (await db.writingGoals.get(libraryGoalsId)) ?? defaultWritingGoals;
      const goals: WritingGoals = {
        ...existing,
        ...patch,
        id: libraryGoalsId,
        updatedAt: now(),
      };
      await db.writingGoals.put(goals);
      return goals;
    });
  },
  /**
   * A tome's prose, in words. Read off the stored `wordCount` mirrors rather
   * than parsed, which is the whole reason that field exists.
   */
  async tomeWordCount(tomeId: string) {
    const items = await db.writeItems.where("tomeId").equals(tomeId).toArray();
    return items.reduce((sum, item) => sum + (item.wordCount ?? 0), 0);
  },
  /** The same figure as a live query, for the pages that show it beside a target. */
  observeTomeWordCount(tomeId: string, callback: (v: number) => void) {
    return observe(
      async () =>
        (await db.writeItems.where("tomeId").equals(tomeId).toArray()).reduce(
          (sum, item) => sum + (item.wordCount ?? 0),
          0,
        ),
      callback,
    );
  },
};
