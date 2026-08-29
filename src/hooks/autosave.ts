/**
 * The Write editor's autosave machine, with no React and no DOM in it.
 *
 * It lives apart from `useAutosave` so the timing rules below — the debounce,
 * the floor, the hold, and which of two racing edits wins — can be tested
 * directly under `vitest`'s fake timers in the suite's `node` environment,
 * rather than through a mounted page with Lexical and the store stubbed out.
 * `setTimeout`/`clearTimeout` are used bare rather than off `window` for the
 * same reason.
 */

/**
 * Where an autosaving editor stands. `clean` and `saved` both mean the row on
 * disk matches the screen — they differ only in that `saved` has just happened
 * and says so for a moment before settling back.
 */
export type SaveState = "clean" | "pending" | "saving" | "saved" | "error";

/** How long typing pauses before the autosave fires. */
export const AUTOSAVE_MS = 600;

/**
 * Floor on how long `saving` is reported. Writing one row to IndexedDB resolves
 * in single-digit milliseconds, so without this the state exists but is never
 * seen and the indicator jumps `pending` → `saved`. The floor delays the
 * *report*, never the write: it is counted from the moment the save was started
 * and only ever waits out whatever is left of it.
 */
export const SAVING_MIN_MS = 400;

/** How long `saved` holds before settling back to `clean`. */
export const SAVED_HOLD_MS = 1600;

export interface AutosaveController {
  /** An edit happened: mark dirty, report `pending`, restart the debounce. */
  schedule(): void;
  /** Write now and report it — the retry path. Resolves when the write has. */
  saveNow(): Promise<void>;
  /** True while an edit is waiting to be written. */
  isDirty(): boolean;
  /**
   * Write a waiting edit immediately and **silently** — no states reported, no
   * timers left behind. For the unmount flush, which runs after the component
   * that would render the report is gone.
   */
  flush(): Promise<void>;
  /** Drop pending timers. Leaves `dirty` standing, so `flush` still works. */
  cancel(): void;
  /** Drop everything and report `clean` — for when the row is going away. */
  reset(): void;
}

export function createAutosave({
  save,
  onState,
}: {
  save: () => Promise<void>;
  /** Called on every transition. Never called for a state it is already in. */
  onState: (state: SaveState) => void;
}): AutosaveController {
  let saveTimer: number | undefined;
  // Runs the floor and the hold. Kept apart from `saveTimer` because it is
  // purely cosmetic: clearing it can never lose a write.
  let statusTimer: number | undefined;
  let dirty = false;
  // Bumped by anything that takes over from a write already in flight. A save
  // resolving with a stale ticket reports nothing: clearing `statusTimer` only
  // stops a report that has been *scheduled*, and an awaited save has not
  // scheduled its own yet — without the ticket, a slow write could confirm
  // "saved" on top of a newer write, or over a row that was just deleted.
  let generation = 0;

  const saveNow = async () => {
    const ticket = (generation += 1);
    dirty = false;
    clearTimeout(saveTimer);
    clearTimeout(statusTimer);
    onState("saving");
    const started = Date.now();
    try {
      await save();
    } catch (error) {
      if (ticket !== generation) return;
      console.error(error);
      onState("error");
      return;
    }
    if (ticket !== generation) return;
    // Wait out whatever is left of the floor, then confirm. A fresh edit
    // arriving in the meantime cancels both of these where they stand —
    // `schedule` clears `statusTimer`, which is what actually keeps a stale
    // "saved" or "clean" off the screen. The `dirty` checks are belt and
    // braces for a future caller that marks an edit without clearing it.
    statusTimer = setTimeout(
      () => {
        if (dirty) return;
        onState("saved");
        statusTimer = setTimeout(() => {
          if (!dirty) onState("clean");
        }, SAVED_HOLD_MS);
      },
      Math.max(0, SAVING_MIN_MS - (Date.now() - started)),
    );
  };

  return {
    schedule() {
      dirty = true;
      clearTimeout(statusTimer);
      onState("pending");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, AUTOSAVE_MS);
    },
    saveNow,
    isDirty: () => dirty,
    async flush() {
      if (!dirty) return;
      generation += 1;
      dirty = false;
      clearTimeout(saveTimer);
      await save();
    },
    cancel() {
      generation += 1;
      clearTimeout(saveTimer);
      clearTimeout(statusTimer);
    },
    reset() {
      generation += 1;
      dirty = false;
      clearTimeout(saveTimer);
      clearTimeout(statusTimer);
      onState("clean");
    },
  };
}
