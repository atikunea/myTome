import { store } from "./store";
import { transport } from "#backupTransport";
import type { AutoExportWrite } from "./backupTransport";

/**
 * Automatic backup export: keeping a folder full of whole-library backup
 * files, without anyone remembering to.
 *
 * **The file is a `BackupFile` from `backup.ts`, unchanged** — the same rule
 * Drive sync follows. Transport, never format. What lands in that folder is
 * exactly what "Download backup" produces, so restoring one is the restore
 * that already exists, and pointing the folder at Drive, Dropbox or a git repo
 * is a sync story that needs no OAuth at all.
 *
 * The decision of *whether to write now* is pure and lives at the top of this
 * file, tested under `node` beside `activityStats.ts` and `autosave.ts` for
 * the reason this repo always gives: timing logic trapped in an effect is
 * logic nothing can check. Everything below `runAutoExport` touches the
 * database, the platform and `localStorage`, and is verified in the running
 * app instead.
 *
 * Three things decide it, and only three:
 *
 * - **The library's high-water mark.** The newest `updatedAt` anywhere —
 *   across tomes, author profiles and the writing goals — read through the
 *   same cheap `*Marks` calls a Drive sync plans with, so a check that has
 *   nothing to do never touches a manuscript. An unchanged library writes
 *   nothing, however long the app stays open.
 * - **How long since the last export.** A change does not trigger a write;
 *   it makes the *next scheduled* write worth doing.
 * - **Whether a folder has been chosen at all.** It is off until then. No
 *   silent writing to disk, ever.
 */

export interface AutoExportSettings {
  /** How often to consider writing. Never how often a file appears. */
  everyMinutes: number;
  /** How many automatic exports to keep in the folder. Older ones are deleted. */
  keep: number;
}

export const defaultAutoExportSettings: AutoExportSettings = {
  everyMinutes: 30,
  keep: 10,
};

/**
 * The bounds the UI offers and the storage enforces.
 *
 * `keep` never reaches zero: a retention rule that could empty the folder of
 * every backup it ever wrote is the one outcome this feature must not produce.
 * The main process clamps it a second time, because a value crossing IPC is
 * not a value you checked.
 */
export const autoExportLimits = {
  everyMinutes: { min: 5, max: 24 * 60 },
  keep: { min: 1, max: 50 },
};

const clamp = (value: number, { min, max }: { min: number; max: number }) =>
  Math.max(min, Math.min(max, Math.round(value) || min));

export const clampAutoExportSettings = (settings: AutoExportSettings): AutoExportSettings => ({
  everyMinutes: clamp(settings.everyMinutes, autoExportLimits.everyMinutes),
  keep: clamp(settings.keep, autoExportLimits.keep),
});

/** What the last run left behind. Persisted, so "on launch" means something. */
export interface AutoExportState {
  lastExportAt?: string;
  /** The library's high-water mark as it stood then. */
  lastMark?: string;
  lastFileName?: string;
}

export type AutoExportDecision =
  | { act: "write"; because: "first" | "changed" }
  | { act: "wait"; dueAt: string }
  | { act: "skip"; because: "empty" | "unchanged" };

/**
 * The library's high-water mark: the newest `updatedAt` anywhere in it.
 *
 * Empty string for an empty library, which reads as "nothing to export" rather
 * than "unchanged" — the difference between a folder that stays empty and a
 * folder that gets one file full of nothing.
 */
export const libraryMark = (marks: { touchedAt: string }[]): string =>
  marks.reduce((newest, mark) => (mark.touchedAt > newest ? mark.touchedAt : newest), "");

/**
 * Whether to write now.
 *
 * The order of these four questions is the behaviour:
 *
 * 1. An empty library is never exported.
 * 2. The first run after a folder is chosen writes immediately, so the author
 *    sees a file appear and knows the thing is real.
 * 3. An unchanged library is skipped **before** the clock is consulted — no
 *    point waiting for a deadline that will produce a duplicate.
 * 4. Only then does the interval apply.
 *
 * `dueAt` is returned rather than a duration so a caller can say *when*
 * without doing the arithmetic again, and so the tests read as times.
 */
export const nextAutoExport = ({
  mark,
  now,
  state,
  settings,
}: {
  mark: string;
  now: string;
  state: AutoExportState;
  settings: AutoExportSettings;
}): AutoExportDecision => {
  if (!mark) return { act: "skip", because: "empty" };
  if (!state.lastExportAt) return { act: "write", because: "first" };
  if (mark === state.lastMark) return { act: "skip", because: "unchanged" };

  const dueAt = new Date(
    new Date(state.lastExportAt).getTime() + settings.everyMinutes * 60_000,
  ).toISOString();
  if (now < dueAt) return { act: "wait", dueAt };

  return { act: "write", because: "changed" };
};

/** False on the web, where there is no folder to write to. See `backupTransport.ts`. */
export const autoExportSupported = transport.supported;

const settingsKey = "myTome.autoExport.settings";
const stateKey = "myTome.autoExport.state";

/**
 * `localStorage`, like the Drive sync mark in `drive.ts` and for the same
 * reason: this is a bookmark about this installation, not part of the library,
 * and it must never ride along in a backup file.
 *
 * Every read is defensive. A private window, cleared site data or a value left
 * by an older build must all read as "no settings yet" rather than throw on
 * the way to rendering a page.
 */
const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
};

const persist = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A refusal to store a preference is not worth failing an export over.
  }
};

export const autoExportSettings = (): AutoExportSettings =>
  clampAutoExportSettings(read(settingsKey, defaultAutoExportSettings));

export const saveAutoExportSettings = (settings: AutoExportSettings): AutoExportSettings => {
  const clamped = clampAutoExportSettings(settings);
  persist(settingsKey, clamped);
  return clamped;
};

export const autoExportState = (): AutoExportState => read<AutoExportState>(stateKey, {});

export const autoExportFolder = () => transport.folder();

export const chooseAutoExportFolder = async (): Promise<string | null> => {
  const chosen = await transport.chooseFolder();
  // A new folder is a fresh start: whatever went wrong with the last one is
  // not this one's problem, and the next run should be allowed to happen.
  if (chosen) {
    paused = false;
    lastError = undefined;
    announce();
  }
  return chosen;
};

/**
 * Stops the writing and forgets where it was going. Deliberately leaves every
 * file already in that folder alone — the author asked this app to stop
 * writing, not to take back what it wrote.
 */
export const forgetAutoExportFolder = async (): Promise<void> => {
  await transport.forgetFolder();
  paused = false;
  lastError = undefined;
  announce();
};

/**
 * The last failure, if any — a folder that has been unplugged, renamed or
 * filled up.
 *
 * It is held here rather than persisted because it is about *now*: a stale
 * error read back after a restart would be a lie until the next run proved it
 * either way.
 */
let lastError: string | undefined;

/**
 * **A failure stops the schedule rather than retrying it.** A folder on a
 * drive that is no longer there fails in milliseconds, and a timer that kept
 * trying would spend the rest of the session failing, every interval, forever.
 * The author clears it by picking a folder again or asking for an export by
 * hand — both of which are `runAutoExport({ force: true })`.
 */
let paused = false;

/** Guards against two runs overlapping — `StrictMode` mounts every effect twice. */
let running = false;

export const autoExportError = () => lastError;

export const autoExportPaused = () => paused;

/**
 * Told whenever a run finishes or a folder changes, so the card on `/backup`
 * shows what the scheduler did while it was open.
 *
 * Not a live query, because none of this is in the database — it is a folder
 * the shell remembers and a mark in `localStorage`. This is the smallest thing
 * that keeps the page honest without inventing a store for three values.
 */
const listeners = new Set<() => void>();

export const onAutoExport = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const announce = () => {
  for (const listener of listeners) listener();
};

export type AutoExportOutcome =
  | { ran: true; write: AutoExportWrite; at: string }
  | { ran: false; decision: AutoExportDecision | "no-folder" | "paused" | "busy" };

/**
 * One check, and a write if it is due.
 *
 * `force` is the button on `/backup`: it skips the decision entirely, because
 * an author who asked for an export out loud has answered every question this
 * module would otherwise ask. It also clears a pause — trying again *is* the
 * way out of one.
 */
export const runAutoExport = async (
  { force = false }: { force?: boolean } = {},
): Promise<AutoExportOutcome> => {
  if (!transport.supported) return { ran: false, decision: "no-folder" };
  if (running) return { ran: false, decision: "busy" };
  if (paused && !force) return { ran: false, decision: "paused" };

  running = true;
  try {
    if (!(await transport.folder())) return { ran: false, decision: "no-folder" };

    const settings = autoExportSettings();
    const marks = [
      ...(await store.tomeMarks()),
      ...(await store.authorMarks()),
      ...(await store.goalsMarks()),
    ];
    const mark = libraryMark(marks);
    const now = new Date().toISOString();

    if (!force) {
      const decision = nextAutoExport({ mark, now, state: autoExportState(), settings });
      if (decision.act !== "write") return { ran: false, decision };
    } else if (!mark) {
      return { ran: false, decision: { act: "skip", because: "empty" } };
    }

    const file = await store.exportBackup();
    const write = await transport.write({
      data: new Blob([JSON.stringify(file)], { type: "application/json" }),
      keep: settings.keep,
    });

    // Written only after the bytes landed. A failed export must leave the mark
    // where it was, or the next run would call a library it never exported
    // "unchanged" and skip it forever.
    const at = new Date().toISOString();
    persist(stateKey, { lastExportAt: at, lastMark: mark, lastFileName: write.fileName });
    paused = false;
    lastError = undefined;
    return { ran: true, write, at };
  } catch (cause) {
    lastError = cause instanceof Error ? cause.message : "The backup could not be written.";
    paused = true;
    throw cause;
  } finally {
    running = false;
    announce();
  }
};
