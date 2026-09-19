/**
 * What the activity tracker stores: a row per day, a row per sitting, and one
 * row of goals for the whole library.
 *
 * None of it is authored. Every number here is derived from `WriteItem.wordCount`
 * moving, recorded by `services/activity.ts` inside the same transaction as the
 * save that moved it — see that module's header for why. The one exception is
 * `WritingGoals`, which is the only thing on these three tables the author types.
 */

/**
 * One tome's writing on one local calendar date.
 *
 * `added` and `removed` are gross and always positive; `net` is their
 * difference and is the figure every goal is measured against. Both halves are
 * stored because they cost nothing in a transaction that is already open, and
 * because a day that reads `−310` cannot be explained without them.
 */
export interface WritingDay {
  id: string;
  tomeId: string;
  /** `YYYY-MM-DD`, in the author's local time — see `dayKey` in `activityStats.ts`. */
  date: string;
  added: number;
  removed: number;
  /** `added − removed`. Negative on a day of cutting, and shown that way. */
  net: number;
  /** How many sittings started on this date. */
  sessions: number;
  /**
   * Writing time on this date, summed across its sittings. Fractional, because
   * it accumulates the gap between one save and the next; round it for display.
   */
  minutes: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One sitting. It opens on a save and is closed by arithmetic rather than by a
 * timer: `lastSaveAt` is its end, and the next save either extends it or starts
 * the next one. Nothing has to run while the tab is shut.
 */
export interface WritingSession {
  id: string;
  tomeId: string;
  /** The day it *started* in. A sitting across midnight belongs to the day it began. */
  date: string;
  startedAt: string;
  /** ISO of the most recent save in this sitting — its end. */
  lastSaveAt: string;
  added: number;
  removed: number;
  net: number;
  /** Saves recorded into this sitting, whether or not they moved the count. */
  saves: number;
}

/**
 * The library's goals — one row, shared by every book.
 *
 * The daily goal is deliberately *not* per tome: a streak that broke every time
 * the author worked on their other book would punish exactly the wrong thing.
 * A book's own length and deadline are per tome, and live on `Tome`.
 */
export interface WritingGoals {
  /** Always {@link libraryGoalsId}. This is a settings row, not a collection. */
  id: string;
  /** Words per counted day. `0` means no daily goal, and hides every streak. */
  dailyWords: number;
  /** Which weekdays count, `0`–`6` Sunday-based. A day not listed is skipped. */
  countedDays: number[];
  /** Words in one sitting, if the author set one. */
  sessionWords?: number;
  /** Minutes in one sitting, if the author set one. */
  sessionMinutes?: number;
  updatedAt: string;
}

/**
 * The id of the one `writingGoals` row. A fixed id rather than a uuid because
 * there is exactly one of these and every reader wants *the* goals — the same
 * reason a settings file has a name rather than an index.
 */
export const libraryGoalsId = "library";

/** Monday to Friday. */
export const weekdays = [1, 2, 3, 4, 5];
/** Every day of the week. */
export const everyDay = [0, 1, 2, 3, 4, 5, 6];

/**
 * What the app reads before the author has set anything. A goal of zero means
 * the tracker still records everything and simply shows no target to miss,
 * which is the right first run: it has nothing to say about a habit it has not
 * seen yet.
 */
export const defaultWritingGoals: WritingGoals = {
  id: libraryGoalsId,
  dailyWords: 0,
  countedDays: everyDay,
  updatedAt: "",
};

export const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
