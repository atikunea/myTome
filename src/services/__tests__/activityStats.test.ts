import { describe, it, expect } from "vitest";
import type { WritingDay, WritingGoals } from "../../models/Activity";
import { everyDay, weekdays } from "../../models/Activity";
import {
  IDLE_MS,
  bookProgress,
  calendarMonthLabels,
  calendarStart,
  calendarWeeks,
  continuesSession,
  countedDayAfter,
  countedDaysBetween,
  currentStreak,
  dayKey,
  daysBetween,
  durationLabel,
  heatLevel,
  longestStreak,
  metGoal,
  metSessionTarget,
  netByDay,
  pace,
  parseDay,
  sessionMinutes,
  shiftDay,
  signedWords,
  totalNet,
  weekOf,
  weeksThatFit,
} from "../activityStats";

/**
 * Everything the tracker decides, tested where it can be: no Dexie, no clock of
 * its own, and a `today` handed in rather than read. The dates are real ones —
 * 18 September 2026 is a Friday, 12–13 September a weekend — because a streak
 * test that invented its own weekdays would prove nothing about the rule it is
 * checking.
 */

const goalsOf = (over: Partial<WritingGoals> = {}): WritingGoals => ({
  id: "library",
  dailyWords: 1000,
  countedDays: weekdays,
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

/** `["2026-09-07", 1180]` pairs as the rows the store would have written. */
const daysOf = (...pairs: [string, number][]): WritingDay[] =>
  pairs.map(([date, net]) => ({
    id: date,
    tomeId: "t1",
    date,
    added: net > 0 ? net : 0,
    removed: net < 0 ? -net : 0,
    net,
    sessions: 1,
    minutes: 30,
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
  }));

/** The fortnight the design notes are written against, negative day and all. */
const fortnight = daysOf(
  ["2026-09-07", 1180],
  ["2026-09-08", 1020],
  ["2026-09-09", -310],
  ["2026-09-10", 1640],
  ["2026-09-11", 1205],
  ["2026-09-13", 420],
  ["2026-09-14", 1340],
  ["2026-09-15", 1010],
  ["2026-09-16", 2240],
  ["2026-09-17", 1090],
  ["2026-09-18", 840],
);

describe("days are local calendar dates", () => {
  it("round-trips a key through a local Date", () => {
    expect(dayKey(parseDay("2026-09-18"))).toBe("2026-09-18");
  });

  /**
   * The bug this rule exists to prevent: `new Date("2026-09-18")` is UTC
   * midnight, which is the 17th anywhere west of Greenwich. Everything here
   * goes through `parseDay` instead, so the key means the same day everywhere.
   */
  it("reads a key as the local day, not as UTC midnight", () => {
    const local = parseDay("2026-09-18");
    expect(local.getDate()).toBe(18);
    expect(local.getMonth()).toBe(8);
    expect(local.getHours()).toBe(0);
  });

  it("takes the day from the author's clock, not the timestamp's zone", () => {
    // A local instant always lands on its own local date, whatever the offset.
    const at = new Date(2026, 8, 18, 23, 30);
    expect(dayKey(at)).toBe("2026-09-18");
  });

  it("shifts and measures across a month boundary", () => {
    expect(shiftDay("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(daysBetween("2026-09-18", "2026-09-28")).toBe(10);
    expect(daysBetween("2026-09-28", "2026-09-18")).toBe(-10);
  });

  it("shifts across a daylight-saving boundary without losing a day", () => {
    // Whatever the runner's zone does at the end of October, a calendar day is
    // still one calendar day — the arithmetic is on local Y/M/D, not on hours.
    const keys = Array.from({ length: 5 }, (_, i) => shiftDay("2026-10-23", i));
    expect(keys).toEqual([
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });
});

describe("continuesSession", () => {
  const start = "2026-09-18T09:00:00.000Z";
  const at = (ms: number) => new Date(new Date(start).getTime() + ms).toISOString();

  it("continues a sitting up to and including the idle limit", () => {
    expect(continuesSession(start, at(1000))).toBe(true);
    expect(continuesSession(start, at(IDLE_MS))).toBe(true);
  });

  it("starts a new sitting one millisecond past it", () => {
    expect(continuesSession(start, at(IDLE_MS + 1))).toBe(false);
  });

  /**
   * A clock that moved backwards must not produce a sitting that began before
   * the previous one ended — there is no way to draw that, and no author would
   * recognise it.
   */
  it("continues rather than splitting when the clock goes backwards", () => {
    expect(continuesSession(start, at(-60_000))).toBe(true);
  });

  it("measures writing time from the first save to the last", () => {
    expect(sessionMinutes({ startedAt: start, lastSaveAt: at(52 * 60_000) })).toBe(52);
    expect(sessionMinutes({ startedAt: start, lastSaveAt: start })).toBe(0);
  });
});

describe("currentStreak", () => {
  const goals = goalsOf();

  it("counts the run of met weekdays, skipping the weekend", () => {
    // Thu 10, Fri 11, (weekend), Mon 14, Tue 15, Wed 16, Thu 17 — and Friday
    // the 18th is still in play at 840.
    expect(currentStreak(fortnight, goals, "2026-09-18")).toBe(6);
  });

  it("extends the moment today's goal is met", () => {
    const met = [...fortnight.filter((d) => d.date !== "2026-09-18"), ...daysOf(["2026-09-18", 1000])];
    expect(currentStreak(met, goals, "2026-09-18")).toBe(7);
  });

  it("does not break on an unmet today", () => {
    const quiet = fortnight.filter((day) => day.date !== "2026-09-18");
    expect(currentStreak(quiet, goals, "2026-09-18")).toBe(6);
  });

  it("breaks on a missed counted day — including one that lost words", () => {
    // Wednesday the 9th is −310, so nothing before it can be in the run.
    expect(currentStreak(fortnight, goals, "2026-09-11")).toBe(2);
  });

  it("counts weekend writing when the author counts weekends", () => {
    const daily = goalsOf({ countedDays: everyDay, dailyWords: 400 });
    // Sunday the 13th's 420 now counts, so the run reaches back to it and stops
    // at Saturday the 12th, which has no row at all.
    expect(currentStreak(fortnight, daily, "2026-09-18")).toBe(6);
  });

  it("is zero with no daily goal, because there is nothing to keep", () => {
    expect(currentStreak(fortnight, goalsOf({ dailyWords: 0 }), "2026-09-18")).toBe(0);
  });

  it("finds the longest run in the record", () => {
    expect(longestStreak(fortnight, goals)).toBe(6);
  });
});

describe("counted days", () => {
  const goals = goalsOf();

  it("counts weekdays inclusive of both ends", () => {
    // Fri 18 through Fri 25: 18, 21, 22, 23, 24, 25.
    expect(countedDaysBetween("2026-09-18", "2026-09-25", goals)).toBe(6);
    expect(countedDaysBetween("2026-09-18", "2026-09-18", goals)).toBe(1);
  });

  it("is zero once the end is before the start", () => {
    expect(countedDaysBetween("2026-09-18", "2026-09-17", goals)).toBe(0);
  });

  it("finds the nth counted day, stepping over weekends", () => {
    // Friday is the first; Monday the 21st is the second.
    expect(countedDayAfter("2026-09-18", 1, goals)).toBe("2026-09-18");
    expect(countedDayAfter("2026-09-18", 2, goals)).toBe("2026-09-21");
    expect(countedDayAfter("2026-09-18", 6, goals)).toBe("2026-09-25");
  });

  it("gives up rather than looping when no day counts", () => {
    expect(countedDayAfter("2026-09-18", 1, goalsOf({ countedDays: [] }))).toBeUndefined();
  });
});

describe("pace", () => {
  const goals = goalsOf();
  const book = { total: 52_400, wordTarget: 90_000, deadline: "2026-12-31", goals, today: "2026-09-18" };

  it("derives the pace the deadline demands, and where the goal lands", () => {
    const forecast = pace(book)!;
    expect(forecast.remaining).toBe(37_600);
    // Weekdays from Fri 18 Sep to Thu 31 Dec inclusive.
    expect(forecast.daysLeft).toBe(75);
    expect(forecast.requiredPace).toBe(Math.ceil(37_600 / 75));
    expect(forecast.standing).toBe("ahead");
    // 38 weekdays at 1,000 a day, counting today as the first.
    expect(forecast.projectedEnd).toBe("2026-11-10");
    expect(forecast.slackDays).toBe(51);
  });

  it("reads as behind when the goal is smaller than the pace required", () => {
    const forecast = pace({ ...book, goals: goalsOf({ dailyWords: 300 }) })!;
    expect(forecast.standing).toBe("behind");
    expect(forecast.slackDays).toBeLessThan(0);
  });

  it("projects nothing without a daily goal, but still demands a pace", () => {
    const forecast = pace({ ...book, goals: goalsOf({ dailyWords: 0 }) })!;
    expect(forecast.projectedEnd).toBeUndefined();
    expect(forecast.slackDays).toBeUndefined();
    expect(forecast.requiredPace).toBeGreaterThan(0);
    expect(forecast.standing).toBe("behind");
  });

  it("is overdue once the deadline has passed with words left", () => {
    const forecast = pace({ ...book, today: "2027-01-04" })!;
    expect(forecast.daysLeft).toBe(0);
    expect(forecast.standing).toBe("overdue");
    expect(forecast.requiredPace).toBe(37_600);
  });

  it("is done once the target is reached, deadline or not", () => {
    expect(pace({ ...book, total: 91_000 })!.standing).toBe("done");
  });

  it("has nothing to say without both a target and a deadline", () => {
    expect(pace({ ...book, deadline: undefined })).toBeUndefined();
    expect(pace({ ...book, wordTarget: undefined })).toBeUndefined();
  });

  it("reports a book's progress against its target alone", () => {
    expect(bookProgress(52_400, 90_000)).toMatchObject({ remaining: 37_600, done: false });
    expect(bookProgress(90_001, 90_000)).toMatchObject({ remaining: 0, done: true, fraction: 1 });
    expect(bookProgress(52_400, undefined)).toBeUndefined();
  });
});

describe("the day's reading", () => {
  const goals = goalsOf();
  const net = netByDay(fortnight);

  it("treats a day with no row as zero", () => {
    expect(metGoal(net, "2026-09-12", goals)).toBe(false);
    expect(totalNet(daysOf(["2026-09-07", 100], ["2026-09-08", -40]))).toBe(60);
  });

  it("never calls an uncounted day met, however much was written", () => {
    // Sunday the 13th clears a 400 goal, but Sundays are not counted.
    expect(metGoal(netByDay(fortnight), "2026-09-13", goalsOf({ dailyWords: 400 }))).toBe(false);
  });

  it("marks a day that lost words apart from a quiet one", () => {
    expect(heatLevel(-310, 1000)).toBe(-1);
    expect(heatLevel(0, 1000)).toBe(0);
    expect(heatLevel(400, 1000)).toBe(1);
    expect(heatLevel(900, 1000)).toBe(2);
    expect(heatLevel(1500, 1000)).toBe(3);
    expect(heatLevel(2240, 1000)).toBe(4);
  });

  it("judges a sitting only when there is a target to judge it against", () => {
    const sitting = {
      startedAt: "2026-09-18T07:12:00.000Z",
      lastSaveAt: "2026-09-18T08:04:00.000Z",
      net: 610,
    };
    expect(metSessionTarget(sitting, goalsOf())).toBeUndefined();
    expect(metSessionTarget(sitting, goalsOf({ sessionWords: 500 }))).toBe(true);
    expect(metSessionTarget(sitting, goalsOf({ sessionWords: 800 }))).toBe(false);
    expect(metSessionTarget(sitting, goalsOf({ sessionMinutes: 90 }))).toBe(false);
  });

  it("formats figures the way every surface shows them", () => {
    expect(signedWords(-310)).toBe("−310");
    expect(signedWords(0)).toBe("0");
    expect(durationLabel(26)).toBe("26m");
    expect(durationLabel(77)).toBe("1h 17m");
    expect(durationLabel(0)).toBe("0m");
  });

  it("gives the week containing a day, Sunday first", () => {
    expect(weekOf("2026-09-18")).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
  });
});

describe("calendarWeeks", () => {
  const goals = goalsOf();

  it("lays days out in columns of seven, padding to the Sunday before", () => {
    // 7 Sep 2026 is a Monday, so its week starts with one empty cell.
    const weeks = calendarWeeks(fortnight, goals, "2026-09-07", "2026-09-18");
    expect(weeks).toHaveLength(2);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]?.date).toBe("2026-09-07");
    expect(weeks[1][5]?.date).toBe("2026-09-18");
    // The trailing Saturday is beyond `to`, so it is padded rather than drawn.
    expect(weeks[1][6]).toBeNull();
  });

  it("carries each day's own reading onto its cell", () => {
    const weeks = calendarWeeks(fortnight, goals, "2026-09-07", "2026-09-18");
    const wednesday = weeks[0][3]!;
    expect(wednesday.date).toBe("2026-09-09");
    expect(wednesday.net).toBe(-310);
    expect(wednesday.met).toBe(false);
    expect(wednesday.level).toBe(-1);
    const sunday = weeks[1][0]!;
    expect(sunday.counted).toBe(false);
    expect(sunday.net).toBe(420);
  });

  it("is empty when the range runs backwards", () => {
    expect(calendarWeeks(fortnight, goals, "2026-09-18", "2026-09-07")).toEqual([]);
  });
});

describe("fitting the calendar to its width", () => {
  // The calendar's own geometry: 13px squares, 3px apart.
  const CELL = 13;
  const GAP = 3;

  it("counts the columns that fit, with no gap after the last", () => {
    // n columns take n·13 + (n−1)·3 px, so 16 columns need exactly 253.
    expect(weeksThatFit(253, CELL, GAP)).toBe(16);
    expect(weeksThatFit(252, CELL, GAP)).toBe(15);
    // A wide workspace holds a year and more.
    expect(weeksThatFit(900, CELL, GAP)).toBe(56);
  });

  it("never fits fewer than one week, however narrow", () => {
    expect(weeksThatFit(0, CELL, GAP)).toBe(1);
    expect(weeksThatFit(5, CELL, GAP)).toBe(1);
  });

  it("starts on the Sunday that makes the columns end in today's week", () => {
    // Friday 18 September's own week began on Sunday the 13th.
    expect(calendarStart("2026-09-18", 1)).toBe("2026-09-13");
    expect(calendarStart("2026-09-18", 3)).toBe("2026-08-30");
    expect(weekOf("2026-09-18")[0]).toBe(calendarStart("2026-09-18", 1));
  });

  it("draws exactly the number of columns it was fitted to", () => {
    for (const count of [1, 4, 17, 52]) {
      const from = calendarStart("2026-09-18", count);
      expect(calendarWeeks(fortnight, goalsOf(), from, "2026-09-18")).toHaveLength(count);
    }
  });
});

describe("calendarMonthLabels", () => {
  const goals = goalsOf();
  const labelsFor = (weeks: number, to = "2026-09-18") =>
    calendarMonthLabels(calendarWeeks(fortnight, goals, calendarStart(to, weeks), to));

  it("labels the first column of each month", () => {
    // 8 weeks back from 18 Sep starts on Sunday 26 July. August begins in the
    // second column (2 Aug) and runs through the week of 30 Aug; September
    // begins at 6 Sep. July's lone first column gives way to August beside it.
    expect(labelsFor(8)).toEqual([null, 7, null, null, null, null, 8, null]);
  });

  it("drops the first column's label when the second would sit on top of it", () => {
    // 3 weeks back starts on Sunday 30 August — August for one column only,
    // with September's label right beside it.
    expect(labelsFor(3)).toEqual([null, 8, null]);
  });

  it("never labels the last column, which would run off the edge", () => {
    // Ending in the week of Sunday 4 October puts October in the last column.
    const labels = labelsFor(4, "2026-10-05");
    expect(labels[labels.length - 1]).toBeNull();
  });

  it("keeps the label on a calendar of one week, which has nowhere to spill", () => {
    expect(labelsFor(1)).toEqual([8]);
  });
});
