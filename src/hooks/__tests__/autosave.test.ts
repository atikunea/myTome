import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_MS,
  SAVED_HOLD_MS,
  SAVING_MIN_MS,
  createAutosave,
  type SaveState,
} from "../autosave";

/**
 * The Write editor's autosave machine. Every test drives it through
 * `createAutosave` directly under fake timers — `Date.now` is faked too, which
 * is what makes the floor in `saveNow` assertable rather than a race.
 *
 * `states` is the whole transition sequence, not a snapshot: most of the rules
 * here are about a state that must *not* be reported (a `saved` after the
 * author has typed again, a `clean` during the hold), and only the sequence
 * shows their absence.
 */
function harness(save: () => Promise<void> = () => Promise.resolve()) {
  const states: SaveState[] = [];
  const spy = vi.fn(save);
  const autosave = createAutosave({
    save: spy,
    onState: (state) => states.push(state),
  });
  return { autosave, states, save: spy };
}

/** A save that stays in flight until the fake clock reaches `ms`. */
const slowSave = (ms: number) => () =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createAutosave", () => {
  it("reports nothing and writes nothing until an edit arrives", async () => {
    const { states, save } = harness();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 10);

    expect(states).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it("reports pending at once but holds the write for the debounce", async () => {
    const { autosave, states, save } = harness();

    autosave.schedule();
    expect(states).toEqual(["pending"]);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["pending", "saving"]);
  });

  it("coalesces a burst of edits into one write", async () => {
    const { autosave, states, save } = harness();

    for (let i = 0; i < 6; i += 1) {
      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS / 2);
    }
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);

    expect(save).toHaveBeenCalledTimes(1);
    // Six edits, but the author is told "editing" once — `schedule` only
    // reports a transition, and the state was already pending.
    expect(states.filter((state) => state === "saving")).toHaveLength(1);
  });

  it("runs the full cycle to rest", async () => {
    const { autosave, states } = harness();

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    await vi.advanceTimersByTimeAsync(SAVING_MIN_MS);
    await vi.advanceTimersByTimeAsync(SAVED_HOLD_MS);

    expect(states).toEqual(["pending", "saving", "saved", "clean"]);
  });

  describe("the saving floor", () => {
    it("keeps an instant write visible for SAVING_MIN_MS", async () => {
      const { autosave, states } = harness();

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      // The write has already resolved by here; only the report is pending.
      expect(states).toEqual(["pending", "saving"]);

      await vi.advanceTimersByTimeAsync(SAVING_MIN_MS - 1);
      expect(states).toEqual(["pending", "saving"]);

      await vi.advanceTimersByTimeAsync(1);
      expect(states).toEqual(["pending", "saving", "saved"]);
    });

    it("adds nothing on top of a write that outlasts it", async () => {
      const slow = SAVING_MIN_MS * 2;
      const { autosave, states } = harness(slowSave(slow));

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + slow);
      // Elapsed already exceeds the floor, so `saved` lands on the next tick
      // rather than waiting out another SAVING_MIN_MS.
      await vi.advanceTimersByTimeAsync(1);

      expect(states).toEqual(["pending", "saving", "saved"]);
    });
  });

  describe("a fresh edit always wins", () => {
    it("suppresses the confirmation when typing resumes mid-write", async () => {
      const { autosave, states } = harness(slowSave(SAVING_MIN_MS * 2));

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(states).toEqual(["pending", "saving"]);

      // Types again while the first write is still in flight.
      autosave.schedule();
      await vi.advanceTimersByTimeAsync(SAVING_MIN_MS * 3);

      // The first write resolved, but its `saved` is never reported: the
      // screen is ahead of the disk again and saying "saved" would be a lie.
      expect(states).toEqual(["pending", "saving", "pending", "saving"]);
    });

    it("suppresses the settle when typing resumes during the hold", async () => {
      const { autosave, states } = harness();

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + SAVING_MIN_MS);
      expect(states).toEqual(["pending", "saving", "saved"]);

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(SAVED_HOLD_MS);

      // No stray `clean` from the hold timer that was already ticking — the
      // second cycle simply runs its course on top.
      expect(states).not.toContain("clean");
      expect(states).toEqual([
        "pending",
        "saving",
        "saved",
        "pending",
        "saving",
        "saved",
      ]);
    });

    it("never lets a stale write confirm over a newer one", async () => {
      const slow = SAVING_MIN_MS * 2;
      const { autosave, states, save } = harness(slowSave(slow));

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      autosave.schedule();

      // Long enough for both writes to resolve and both floors to expire.
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + slow + SAVING_MIN_MS);

      expect(save).toHaveBeenCalledTimes(2);
      // Two writes, one confirmation: the first resolved after the second had
      // taken over, and a "saved" from it would have described stale content.
      expect(states.filter((state) => state === "saved")).toHaveLength(1);
      expect(states).toEqual([
        "pending",
        "saving",
        "pending",
        "saving",
        "saved",
      ]);
    });
  });

  describe("failure", () => {
    it("reports error and stops, rather than settling", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { autosave, states } = harness(() =>
        Promise.reject(new Error("quota exceeded")),
      );

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(states).toEqual(["pending", "saving", "error"]);

      // Neither the floor nor the hold may fire behind a failure.
      await vi.advanceTimersByTimeAsync(SAVING_MIN_MS + SAVED_HOLD_MS);
      expect(states).toEqual(["pending", "saving", "error"]);
    });

    it("does not let a stale failure clobber a newer write", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      let call = 0;
      const { autosave, states } = harness(() => {
        call += 1;
        // The first write is still in flight when the second starts, and only
        // then fails.
        return call === 1
          ? new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error("stale failure")), AUTOSAVE_MS + 200),
            )
          : Promise.resolve();
      });

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);

      // The superseded write's rejection is swallowed: reporting "couldn't
      // save" would send the author chasing a write that has been replaced.
      expect(states).toEqual(["pending", "saving", "pending", "saving", "saved"]);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("recovers through saveNow — the Retry button", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      let failing = true;
      const { autosave, states, save } = harness(() =>
        failing ? Promise.reject(new Error("quota exceeded")) : Promise.resolve(),
      );

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(states).toEqual(["pending", "saving", "error"]);

      failing = false;
      await autosave.saveNow();
      await vi.advanceTimersByTimeAsync(SAVING_MIN_MS);

      expect(save).toHaveBeenCalledTimes(2);
      expect(states).toEqual([
        "pending",
        "saving",
        "error",
        "saving",
        "saved",
      ]);
    });

    it("leaves the editor dirty-free so a later edit starts a clean cycle", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { autosave } = harness(() => Promise.reject(new Error("nope")));

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);

      expect(autosave.isDirty()).toBe(false);
    });
  });

  describe("flush — the unmount write", () => {
    it("writes a waiting edit without reporting anything", async () => {
      const { autosave, states, save } = harness();

      autosave.schedule();
      expect(autosave.isDirty()).toBe(true);

      await autosave.flush();

      expect(save).toHaveBeenCalledTimes(1);
      // `pending` from the schedule, and nothing from the flush itself: the
      // component that would render a transition is already gone.
      expect(states).toEqual(["pending"]);
      expect(autosave.isDirty()).toBe(false);
    });

    it("does nothing when there is no waiting edit", async () => {
      const { autosave, save } = harness();

      await autosave.flush();

      expect(save).not.toHaveBeenCalled();
    });

    it("does not let the debounce fire a second write after it", async () => {
      const { autosave, save } = harness();

      autosave.schedule();
      await autosave.flush();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);

      expect(save).toHaveBeenCalledTimes(1);
    });

    it("still writes after cancel, which drops timers but not the edit", async () => {
      const { autosave, save } = harness();

      autosave.schedule();
      autosave.cancel();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
      expect(save).not.toHaveBeenCalled();
      expect(autosave.isDirty()).toBe(true);

      await autosave.flush();
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancel and reset", () => {
    it("cancel stops a pending write and every timer behind it", async () => {
      const { autosave, states, save } = harness();

      autosave.schedule();
      autosave.cancel();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + SAVING_MIN_MS + SAVED_HOLD_MS);

      expect(save).not.toHaveBeenCalled();
      expect(states).toEqual(["pending"]);
    });

    it("cancel silences a confirmation that was already scheduled", async () => {
      const { autosave, states } = harness();

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(states).toEqual(["pending", "saving"]);

      autosave.cancel();
      await vi.advanceTimersByTimeAsync(SAVING_MIN_MS + SAVED_HOLD_MS);

      expect(states).toEqual(["pending", "saving"]);
    });

    it("reset silences a write already in flight over the deleted row", async () => {
      const { autosave, states } = harness(slowSave(SAVING_MIN_MS));

      autosave.schedule();
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
      expect(states).toEqual(["pending", "saving"]);

      // The confirm dialog is accepted while the write is still in flight.
      autosave.reset();
      await vi.advanceTimersByTimeAsync(SAVING_MIN_MS * 2 + SAVED_HOLD_MS);

      expect(states).toEqual(["pending", "saving", "clean"]);
    });

    it("reset drops the write and returns to rest — the delete path", async () => {
      const { autosave, states, save } = harness();

      autosave.schedule();
      autosave.reset();

      expect(states).toEqual(["pending", "clean"]);
      expect(autosave.isDirty()).toBe(false);

      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + SAVING_MIN_MS + SAVED_HOLD_MS);
      // Nothing may reach a row that is being deleted.
      expect(save).not.toHaveBeenCalled();
      expect(states).toEqual(["pending", "clean"]);
    });
  });
});
