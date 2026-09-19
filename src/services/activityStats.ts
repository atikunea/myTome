import type { WritingDay, WritingGoals, WritingSession } from "../models/Activity";

/**
 * Every decision the activity tracker makes, with no Dexie and no DOM in it.
 *
 * It lives apart from `activity.ts` for the reason `syncPlan.ts` lives apart
 * from `drive.ts` and `autosave.ts` from `useAutosave.ts`: the rules worth
 * getting right — when one sitting becomes the next, what a streak survives,
 * when a book lands relative to its deadline — are arithmetic, and arithmetic
 * is testable under the suite's `node` environment. Nothing here reads a table;
 * every function takes what it needs, including the clock.
 *
 * **Days are local calendar dates, and they are strings.** A `YYYY-MM-DD` key
 * is computed where a save happens and stored on the row. Deriving it from an
 * ISO timestamp at read time would rewrite an author's history the first time
 * they wrote on a plane: the same instant is two different days either side of
 * a date line, and a streak is a claim about the days they *lived*, not about
 * UTC. That is also why every date function here goes through `parseDay`, which
 * builds a local `Date` — `new Date("2026-09-18")` is UTC midnight, which in the
 * Americas is the day before.
 */

/** How long a sitting can be interrupted before the next save starts a new one. */
export const IDLE_MS = 10 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar date of an instant, as `YYYY-MM-DD`. */
export const dayKey = (at: Date | string = new Date()) => {
  const date = typeof at === "string" ? new Date(at) : at;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** A `YYYY-MM-DD` key as a local `Date` at midnight. Never `new Date(key)`. */
export const parseDay = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

/** The key `days` calendar days after `key` (negative to go back). */
export const shiftDay = (key: string, days: number) => {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
};

/** `0`–`6`, Sunday-based — the value `WritingGoals.countedDays` holds. */
export const weekdayOf = (key: string) => parseDay(key).getDay();

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) =>
  Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);

/** Whether this date is one the author's goal applies to. */
export const isCountedDay = (key: string, goals: Pick<WritingGoals, "countedDays">) =>
  goals.countedDays.includes(weekdayOf(key));

/**
 * Whether a save at `at` belongs to the sitting that last saved at `lastSaveAt`.
 *
 * A gap running *backwards* continues the sitting too. The clock can move back
 * — a manual change, an NTP correction — and the alternative is a second
 * session that started before the first one ended, which no reader could draw.
 */
export const continuesSession = (lastSaveAt: string, at: string) =>
  new Date(at).getTime() - new Date(lastSaveAt).getTime() <= IDLE_MS;

/** A sitting's writing time: first save to last, in whole minutes. */
export const sessionMinutes = (session: Pick<WritingSession, "startedAt" | "lastSaveAt">) =>
  Math.max(
    0,
    Math.round(
      (new Date(session.lastSaveAt).getTime() - new Date(session.startedAt).getTime()) /
        60_000,
    ),
  );

/** `1 day` / `6 days` — the counts on these pages are small enough to read. */
export const plural = (count: number, noun: string) =>
  `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;

/** `1h 17m`, or `26m` — a duration read at a glance rather than parsed. */
export const durationLabel = (minutes: number) => {
  const whole = Math.max(0, Math.round(minutes));
  return whole < 60 ? `${whole}m` : `${Math.floor(whole / 60)}h ${whole % 60}m`;
};

/**
 * A net figure with an explicit sign, using a real minus rather than a hyphen.
 * Every surface shows these, and a day of cutting must never read as a smaller
 * good day.
 */
export const signedWords = (net: number) =>
  `${net < 0 ? "−" : ""}${Math.abs(net).toLocaleString()}`;

/** Whether a sitting reached whatever target the author set for one. */
export const metSessionTarget = (
  session: Pick<WritingSession, "startedAt" | "lastSaveAt" | "net">,
  goals: Pick<WritingGoals, "sessionWords" | "sessionMinutes">,
) => {
  const words = goals.sessionWords ?? 0;
  const minutes = goals.sessionMinutes ?? 0;
  if (!words && !minutes) return undefined;
  return session.net >= words && sessionMinutes(session) >= minutes;
};

/** `date → net`, for the lookups every function below does. */
export const netByDay = (days: readonly WritingDay[]) =>
  new Map(days.map((day) => [day.date, day.net]));

/** A day with no row is a day with net 0 — absence and zero are the same fact. */
export const netOn = (net: Map<string, number>, key: string) => net.get(key) ?? 0;

/** Whether a counted day reached the goal. An uncounted day is never "met". */
export const metGoal = (
  net: Map<string, number>,
  key: string,
  goals: Pick<WritingGoals, "dailyWords" | "countedDays">,
) => goals.dailyWords > 0 && isCountedDay(key, goals) && netOn(net, key) >= goals.dailyWords;

/**
 * The run of counted days met, ending today.
 *
 * **Today never breaks a streak.** Until the day is over it is still in play, so
 * an unmet today is stepped over rather than counted as a miss — a streak that
 * collapsed at 09:00 because the author had not started yet would be a bug that
 * reads as a feature. A *met* today does extend it, because hitting the goal
 * should be visible the moment it happens.
 *
 * Uncounted days (weekends, when the author writes weekdays) are skipped in
 * both directions: they neither extend a streak nor break one.
 */
export const currentStreak = (
  days: readonly WritingDay[],
  goals: Pick<WritingGoals, "dailyWords" | "countedDays">,
  today = dayKey(),
) => {
  if (goals.dailyWords <= 0 || !goals.countedDays.length) return 0;
  const net = netByDay(days);
  let run = 0;
  let key = today;
  // Walk back to the earliest day anything is known about. Nothing before the
  // first row can have been met, so that is where the run must end.
  const earliest = days.reduce((min, day) => (min && min < day.date ? min : day.date), "");
  while (earliest && key >= earliest) {
    if (isCountedDay(key, goals)) {
      if (metGoal(net, key, goals)) run += 1;
      else if (key !== today) break;
    }
    key = shiftDay(key, -1);
  }
  return run;
};

/** The longest run of met counted days anywhere in the record. */
export const longestStreak = (
  days: readonly WritingDay[],
  goals: Pick<WritingGoals, "dailyWords" | "countedDays">,
) => {
  if (goals.dailyWords <= 0 || !goals.countedDays.length || !days.length) return 0;
  const net = netByDay(days);
  const keys = days.map((day) => day.date).sort();
  const first = keys[0];
  const last = keys[keys.length - 1];
  let best = 0;
  let run = 0;
  for (let key = first; key <= last; key = shiftDay(key, 1)) {
    if (!isCountedDay(key, goals)) continue;
    run = metGoal(net, key, goals) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
};

/** How many counted days fall in `from`…`to` inclusive. */
export const countedDaysBetween = (
  from: string,
  to: string,
  goals: Pick<WritingGoals, "countedDays">,
) => {
  if (!goals.countedDays.length || daysBetween(from, to) < 0) return 0;
  let count = 0;
  for (let key = from; key <= to; key = shiftDay(key, 1))
    if (isCountedDay(key, goals)) count += 1;
  return count;
};

/**
 * The date of the `n`th counted day at or after `from` (`n` counting from 1).
 * Returns `undefined` rather than looping forever when no day counts.
 */
export const countedDayAfter = (
  from: string,
  n: number,
  goals: Pick<WritingGoals, "countedDays">,
) => {
  if (!goals.countedDays.length || n < 1) return undefined;
  let key = from;
  let seen = 0;
  // Five years of calendar days is a bound no real target reaches, and it is
  // what stops a bad target spinning the browser.
  for (let step = 0; step < 366 * 5; step += 1) {
    if (isCountedDay(key, goals)) {
      seen += 1;
      if (seen === n) return key;
    }
    key = shiftDay(key, 1);
  }
  return undefined;
};

/** How far through its target a book is. `undefined` when it has no target. */
export const bookProgress = (total: number, wordTarget?: number) => {
  if (!wordTarget || wordTarget <= 0) return undefined;
  return {
    total,
    wordTarget,
    remaining: Math.max(0, wordTarget - total),
    fraction: Math.min(1, total / wordTarget),
    done: total >= wordTarget,
  };
};

export interface Pace {
  remaining: number;
  /** Counted days left, today included. `0` once the deadline is past. */
  daysLeft: number;
  /** Words per counted day needed from today. */
  requiredPace: number;
  /** Where the daily goal lands the book, if there is a goal. */
  projectedEnd?: string;
  /** Calendar days between the projection and the deadline; negative is late. */
  slackDays?: number;
  standing: "done" | "ahead" | "behind" | "overdue";
}

/**
 * What the deadline demands, derived fresh every time it is asked.
 *
 * Nothing here is stored. A required pace written to a row would be wrong the
 * moment the next word was typed, and the inputs — the book's total, its
 * target, the daily goal — are all already live queries.
 */
export const pace = (input: {
  total: number;
  wordTarget?: number;
  deadline?: string;
  goals: Pick<WritingGoals, "dailyWords" | "countedDays">;
  today?: string;
}): Pace | undefined => {
  const { total, wordTarget, deadline, goals } = input;
  const today = input.today ?? dayKey();
  if (!wordTarget || wordTarget <= 0 || !deadline) return undefined;
  const remaining = Math.max(0, wordTarget - total);
  const daysLeft = countedDaysBetween(today, deadline, goals);
  if (!remaining)
    return { remaining, daysLeft, requiredPace: 0, slackDays: daysBetween(today, deadline), standing: "done" };
  if (!daysLeft)
    return { remaining, daysLeft, requiredPace: remaining, standing: "overdue" };
  const requiredPace = Math.ceil(remaining / daysLeft);
  const projectedEnd =
    goals.dailyWords > 0
      ? countedDayAfter(today, Math.ceil(remaining / goals.dailyWords), goals)
      : undefined;
  return {
    remaining,
    daysLeft,
    requiredPace,
    projectedEnd,
    slackDays: projectedEnd ? daysBetween(projectedEnd, deadline) : undefined,
    standing: goals.dailyWords > 0 && requiredPace <= goals.dailyWords ? "ahead" : "behind",
  };
};

/** One square in the calendar. `null` stands for a cell outside the range. */
export interface CalendarCell {
  date: string;
  net: number;
  counted: boolean;
  met: boolean;
  /** `0`–`4` for a day that gained words, `-1` for one that lost them. */
  level: number;
}

/**
 * How dark a square is drawn. Four steps rather than a continuous ramp, because
 * the question a calendar answers is "did I write, and roughly how much" — and
 * a reader cannot tell 62% opacity from 68%.
 */
export const heatLevel = (net: number, dailyWords: number) => {
  if (net < 0) return -1;
  if (net === 0) return 0;
  const goal = dailyWords > 0 ? dailyWords : 1000;
  if (net < goal * 0.5) return 1;
  if (net < goal) return 2;
  if (net < goal * 2) return 3;
  return 4;
};

/**
 * The calendar as columns of seven, each column a week running Sunday to
 * Saturday. Weeks rather than months because a week is the unit the eye reads a
 * habit in; leading cells before `from` are `null` so the rows stay weekdays.
 */
export const calendarWeeks = (
  days: readonly WritingDay[],
  goals: Pick<WritingGoals, "dailyWords" | "countedDays">,
  from: string,
  to: string,
): (CalendarCell | null)[][] => {
  const net = netByDay(days);
  const weeks: (CalendarCell | null)[][] = [];
  if (daysBetween(from, to) < 0) return weeks;
  // Back up to the Sunday on or before `from`, and pad what it doesn't cover.
  let key = shiftDay(from, -weekdayOf(from));
  let week: (CalendarCell | null)[] = [];
  while (key <= to) {
    if (key < from) week.push(null);
    else {
      const value = netOn(net, key);
      week.push({
        date: key,
        net: value,
        counted: isCountedDay(key, goals),
        met: metGoal(net, key, goals),
        level: heatLevel(value, goals.dailyWords),
      });
    }
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    key = shiftDay(key, 1);
  }
  if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
  return weeks;
};

/** Days in the record, newest first — the order the day table reads them. */
export const recentDays = (days: readonly WritingDay[], limit?: number) => {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return limit === undefined ? sorted : sorted.slice(0, limit);
};

/** Net words across the given days — the library page's headline, and a week's. */
export const totalNet = (days: readonly WritingDay[]) =>
  days.reduce((sum, day) => sum + day.net, 0);

/** The days of the week containing `today`, Sunday first. */
export const weekOf = (today = dayKey()) => {
  const start = shiftDay(today, -weekdayOf(today));
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
};
