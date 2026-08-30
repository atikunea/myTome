import { describe, it, expect } from "vitest";
import { planIsEmpty, planSync } from "../syncPlan";
import type { LocalTome, RemoteTome } from "../syncPlan";

const local = (id: string, touchedAt: string): LocalTome => ({
  id,
  title: id,
  touchedAt,
});

const remote = (
  tomeId: string,
  touchedAt: string,
  fileId = `file-${tomeId}`,
): RemoteTome => ({
  fileId,
  tomeId,
  touchedAt,
  modifiedTime: touchedAt,
});

const day = (n: number) => `2026-08-${String(n).padStart(2, "0")}T00:00:00.000Z`;

describe("planSync", () => {
  it("does nothing when both sides agree", () => {
    const plan = planSync([local("a", day(1))], [remote("a", day(1))]);

    expect(plan.pull).toEqual([]);
    expect(plan.push).toEqual([]);
    expect(plan.matched.map((t) => t.id)).toEqual(["a"]);
    expect(planIsEmpty(plan)).toBe(true);
  });

  it("uploads a tome Drive has never seen", () => {
    const plan = planSync([local("a", day(1))], []);

    expect(plan.push.map((t) => t.id)).toEqual(["a"]);
    expect(plan.pull).toEqual([]);
  });

  it("downloads a tome this browser has never seen", () => {
    const plan = planSync([], [remote("a", day(1))]);

    expect(plan.pull.map((f) => f.fileId)).toEqual(["file-a"]);
    expect(plan.push).toEqual([]);
  });

  it("moves each tome the way its own high-water mark points", () => {
    const plan = planSync(
      [local("older-here", day(1)), local("newer-here", day(9))],
      [remote("older-here", day(5)), remote("newer-here", day(2))],
    );

    expect(plan.pull.map((f) => f.tomeId)).toEqual(["older-here"]);
    expect(plan.push.map((t) => t.id)).toEqual(["newer-here"]);
  });

  it("keeps the newest of two files claiming the same tome", () => {
    const plan = planSync(
      [],
      [remote("a", day(1), "old-file"), remote("a", day(4), "new-file")],
    );

    expect(plan.pull.map((f) => f.fileId)).toEqual(["new-file"]);
    expect(plan.duplicates.map((f) => f.fileId)).toEqual(["old-file"]);
  });

  it("ignores files in the folder that are not tome backups", () => {
    const stray = { fileId: "x", tomeId: "", touchedAt: "", modifiedTime: day(1) };

    const plan = planSync([local("a", day(1))], [remote("a", day(1)), stray]);

    expect(plan.pull).toEqual([]);
    expect(plan.duplicates).toEqual([]);
    expect(plan.matched).toHaveLength(1);
  });

  it("brings back a tome deleted here — sync has no tombstones", () => {
    // Documented behavior, not an accident: "deleted here" and "never seen
    // here" are the same thing to a listing, so the file wins. Removing a tome
    // for good means deleting its Drive file too.
    const plan = planSync([], [remote("a", day(1))]);

    expect(plan.pull.map((f) => f.tomeId)).toEqual(["a"]);
  });
});
