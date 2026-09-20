import { describe, it, expect } from "vitest";
import {
  autoExportLimits,
  clampAutoExportSettings,
  defaultAutoExportSettings,
  libraryMark,
  nextAutoExport,
} from "../autoExport";
import type { AutoExportSettings, AutoExportState } from "../autoExport";

/**
 * The pure half of automatic backup export: given what the library's
 * high-water mark is, what time it is, and what the last run left behind,
 * should a file be written?
 *
 * Everything below `runAutoExport` in that module touches the database, the
 * platform and `localStorage`, and is verified in the running desktop app
 * instead — see `docs/desktop-verification.md`.
 */

const settings: AutoExportSettings = { everyMinutes: 30, keep: 10 };

/** Minutes after the reference export, as an ISO string. */
const at = (minutes: number) =>
  new Date(Date.parse("2026-09-20T12:00:00.000Z") + minutes * 60_000).toISOString();

const exported = (state: Partial<AutoExportState> = {}): AutoExportState => ({
  lastExportAt: at(0),
  lastMark: "2026-09-20T11:59:00.000Z",
  ...state,
});

describe("libraryMark", () => {
  it("is the newest mark anywhere in the library", () => {
    expect(
      libraryMark([
        { touchedAt: "2026-01-02T00:00:00.000Z" },
        { touchedAt: "2026-03-04T00:00:00.000Z" },
        { touchedAt: "2026-02-03T00:00:00.000Z" },
      ]),
    ).toBe("2026-03-04T00:00:00.000Z");
  });

  it("is empty for an empty library", () => {
    expect(libraryMark([])).toBe("");
  });

  it("takes tomes, profiles and goals as one list", () => {
    // The caller concatenates three `*Marks` calls; nothing here cares which
    // kind a mark came from, and a goal changed alone is still a change.
    const tomes = [{ touchedAt: "2026-05-01T00:00:00.000Z" }];
    const goals = [{ touchedAt: "2026-06-01T00:00:00.000Z" }];
    expect(libraryMark([...tomes, ...goals])).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("nextAutoExport", () => {
  it("never exports an empty library", () => {
    expect(
      nextAutoExport({ mark: "", now: at(0), state: {}, settings }),
    ).toEqual({ act: "skip", because: "empty" });
  });

  it("writes immediately on the first run, so a chosen folder proves itself", () => {
    expect(
      nextAutoExport({ mark: "2026-09-20T11:00:00.000Z", now: at(0), state: {}, settings }),
    ).toEqual({ act: "write", because: "first" });
  });

  it("skips an unchanged library however long it has been", () => {
    const state = exported();
    expect(
      nextAutoExport({ mark: state.lastMark!, now: at(60 * 24), state, settings }),
    ).toEqual({ act: "skip", because: "unchanged" });
  });

  it("waits out the interval when the library has changed", () => {
    const decision = nextAutoExport({
      mark: "2026-09-20T12:05:00.000Z",
      now: at(10),
      state: exported(),
      settings,
    });
    expect(decision).toEqual({ act: "wait", dueAt: at(30) });
  });

  it("writes once the interval has passed and something changed", () => {
    expect(
      nextAutoExport({
        mark: "2026-09-20T12:05:00.000Z",
        now: at(30),
        state: exported(),
        settings,
      }),
    ).toEqual({ act: "write", because: "changed" });
  });

  it("checks the change before the clock, so a due deadline cannot force a duplicate", () => {
    // Long overdue, but nothing has moved — the answer is still "nothing to
    // do", not "write an identical file".
    const state = exported();
    expect(
      nextAutoExport({ mark: state.lastMark!, now: at(600), state, settings }),
    ).toEqual({ act: "skip", because: "unchanged" });
  });

  it("follows the author's interval rather than the default", () => {
    const hourly: AutoExportSettings = { everyMinutes: 60, keep: 10 };
    const changed = { mark: "2026-09-20T12:05:00.000Z", state: exported() };
    expect(nextAutoExport({ ...changed, now: at(45), settings: hourly })).toEqual({
      act: "wait",
      dueAt: at(60),
    });
    expect(nextAutoExport({ ...changed, now: at(60), settings: hourly })).toEqual({
      act: "write",
      because: "changed",
    });
  });

  it("waits rather than writing when the clock has gone backwards", () => {
    // A machine that woke up with a corrected clock must not be read as "the
    // interval elapsed"; the next honest deadline is still the one on record.
    const decision = nextAutoExport({
      mark: "2026-09-20T12:05:00.000Z",
      now: at(-120),
      state: exported(),
      settings,
    });
    expect(decision).toEqual({ act: "wait", dueAt: at(30) });
  });

  it("treats a library whose mark went backwards as changed", () => {
    // A restore can move the high-water mark *down*. It is still not what was
    // exported last time, and that is the only question being asked.
    expect(
      nextAutoExport({
        mark: "2026-01-01T00:00:00.000Z",
        now: at(30),
        state: exported(),
        settings,
      }),
    ).toEqual({ act: "write", because: "changed" });
  });
});

describe("clampAutoExportSettings", () => {
  it("leaves the defaults alone", () => {
    expect(clampAutoExportSettings(defaultAutoExportSettings)).toEqual(defaultAutoExportSettings);
  });

  it("never lets retention reach zero", () => {
    // The one outcome this feature must not produce: a rule that empties the
    // folder of every backup it wrote.
    expect(clampAutoExportSettings({ everyMinutes: 30, keep: 0 }).keep).toBe(
      autoExportLimits.keep.min,
    );
    expect(clampAutoExportSettings({ everyMinutes: 30, keep: -5 }).keep).toBe(
      autoExportLimits.keep.min,
    );
  });

  it("holds both values inside their bounds", () => {
    expect(clampAutoExportSettings({ everyMinutes: 1, keep: 9999 })).toEqual({
      everyMinutes: autoExportLimits.everyMinutes.min,
      keep: autoExportLimits.keep.max,
    });
    expect(clampAutoExportSettings({ everyMinutes: 999_999, keep: 3 })).toEqual({
      everyMinutes: autoExportLimits.everyMinutes.max,
      keep: 3,
    });
  });

  it("reads a stored value that is not a number at all as the minimum", () => {
    // `localStorage` can hand back anything an older build, or a hand edit,
    // left behind. `NaN` must not become the interval.
    expect(
      clampAutoExportSettings({ everyMinutes: Number.NaN, keep: Number.NaN }),
    ).toEqual({
      everyMinutes: autoExportLimits.everyMinutes.min,
      keep: autoExportLimits.keep.min,
    });
  });
});
