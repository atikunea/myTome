import { app, BrowserWindow, dialog } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BridgeFileFilter } from "./bridge.js";

/**
 * Everything this app is allowed to do to a disk: native dialogs, and the
 * automatic backup export at the bottom of the file.
 *
 * **The renderer never names a path.** For a dialog it offers a suggested
 * *filename* and the author picks the rest; for an automatic export it names
 * nothing at all. That is what makes writing safe without the allowlist
 * `drive.ts` needs — every destination was chosen in the author's own
 * operating-system dialog, and a page cannot reach past one.
 *
 * The dialogs are attached to the window, so they are sheet-modal on macOS
 * rather than free-floating, and cannot be lost behind the app.
 */

const parentWindow = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

const showSave = (options: Electron.SaveDialogOptions) => {
  const parent = parentWindow();
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
};

const showOpen = (options: Electron.OpenDialogOptions) => {
  const parent = parentWindow();
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
};

export const save = async (request: {
  suggestedName: string;
  filters: BridgeFileFilter[];
  bytes: Uint8Array;
}): Promise<{ saved: boolean; name?: string }> => {
  const result = await showSave({
    defaultPath: request.suggestedName,
    filters: request.filters,
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });

  // A cancel is an ordinary outcome, not an error: the author changed their
  // mind, and the caller says nothing rather than reporting a failure.
  if (result.canceled || !result.filePath) return { saved: false };

  await writeFile(result.filePath, request.bytes);
  // The name, not the path. The page has no use for a filesystem location and
  // no business holding one.
  return { saved: true, name: path.basename(result.filePath) };
};

export const open = async (options: {
  filters: BridgeFileFilter[];
}): Promise<{ name: string; bytes: Uint8Array } | null> => {
  const result = await showOpen({
    filters: options.filters,
    properties: ["openFile"],
  });

  const picked = result.filePaths[0];
  if (result.canceled || !picked) return null;

  return { name: path.basename(picked), bytes: await readFile(picked) };
};

/**
 * ---------------------------------------------------------------------------
 * Automatic backup export
 * ---------------------------------------------------------------------------
 *
 * A folder the author picked once, that whole-library backup files keep
 * landing in. `docs/desktop-app.md` explains why it exists: a library that is
 * visible as ordinary files, and a folder that can itself be inside Drive,
 * Dropbox or a git repo — a sync story that needs no OAuth at all.
 *
 * Three rules hold this together, and all three are here rather than in the
 * renderer on purpose.
 *
 * **The folder is remembered here.** The renderer picks it through a dialog
 * and is afterwards only told what it is. A page cannot name a destination, so
 * an unattended repeating write cannot be pointed somewhere it should not go.
 *
 * **The file name is built here.** That is not tidiness: pruning deletes, and
 * `AUTO_EXPORT_FILE` is the *only* shape it will ever delete. If the renderer
 * named the files, the renderer would be choosing what the pruner is allowed
 * to remove — and a backup the author saved by hand, or anything else living
 * in that folder, would be one bad name away from deletion.
 *
 * **Retention keeps the newest N and removes the rest** — the only place this
 * app deletes a file. It sorts by name rather than by mtime because the name
 * carries the time it was written, and a copied or restored folder can arrive
 * with every mtime identical.
 */

/** Where the chosen folder is remembered, beside the Drive token. */
const SETTINGS_FILE = "auto-export.json";

const settingsPath = () => path.join(app.getPath("userData"), SETTINGS_FILE);

/**
 * `myTome-backup-2026-09-20-1432.json`.
 *
 * **Local time, not UTC.** These names are read by a person looking at a
 * folder sorted by name, and a UTC day rolls over mid-evening for much of the
 * world — the same reason `services/activityStats.ts` keys days locally.
 *
 * The minute is what separates it from a backup saved by hand, which is
 * `myTome-backup-2026-09-20.json` with no time. That file never matches
 * `AUTO_EXPORT_FILE`, and so is never pruned.
 */
const autoExportName = (at: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `myTome-backup-${day}-${pad(at.getHours())}${pad(at.getMinutes())}.json`;
};

/** The one shape the pruner will delete. Anything else in the folder is not ours. */
const AUTO_EXPORT_FILE = /^myTome-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/;

/**
 * The folder survives a restart; nothing else about auto-export does. When it
 * last ran and whether anything has changed since are the renderer's business
 * — it is the one that knows what a library *is* — and live in `localStorage`
 * beside the Drive sync mark.
 */
interface AutoExportSettings {
  folder?: string;
}

const readSettings = (): AutoExportSettings => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsPath(), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return {};
    const { folder } = parsed as AutoExportSettings;
    return typeof folder === "string" && folder ? { folder } : {};
  } catch {
    // Missing on a first run, and unreadable means the same thing here: no
    // folder has been chosen. Never a reason to fail the app's launch.
    return {};
  }
};

const writeSettings = (settings: AutoExportSettings): void => {
  mkdirSync(path.dirname(settingsPath()), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
};

export const folder = async (): Promise<string | undefined> => readSettings().folder;

export const chooseFolder = async (): Promise<string | null> => {
  const result = await showOpen({
    properties: ["openDirectory", "createDirectory"],
  });

  const picked = result.filePaths[0];
  if (result.canceled || !picked) return null;

  writeSettings({ folder: picked });
  return picked;
};

/** Stops the writing. Deliberately leaves every file already written alone. */
export const forgetFolder = async (): Promise<void> => {
  writeSettings({});
};

export const write = async (request: {
  bytes: Uint8Array;
  keep: number;
}): Promise<{ fileName: string; pruned: number }> => {
  const chosen = readSettings().folder;
  if (!chosen) throw new Error("No backup folder has been chosen.");

  // Clamped rather than trusted. `keep: 0` from a confused caller would empty
  // the folder of every automatic export, which is the one outcome this
  // feature must never produce by accident.
  const keep = Math.max(1, Math.min(100, Math.floor(request.keep) || 1));

  const fileName = autoExportName(new Date());
  try {
    // Deliberately no `mkdir`. A folder that has stopped existing is news —
    // an unplugged drive, a cloud folder that moved, a directory the author
    // deleted — and silently recreating it would put files back somewhere
    // they had removed, quietly, forever.
    await writeFile(path.join(chosen, fileName), request.bytes);
  } catch (cause) {
    throw new Error(explain(cause, chosen));
  }

  return { fileName, pruned: await prune(chosen, keep) };
};

/**
 * The three failures worth naming, in words an author can act on. Anything
 * else keeps the system's own message, which is more use than a shrug.
 */
const explain = (cause: unknown, chosen: string): string => {
  const code = (cause as { code?: string } | null)?.code;
  if (code === "ENOENT") return `The backup folder is no longer there: ${chosen}`;
  if (code === "EACCES" || code === "EPERM")
    return `myTome is not allowed to write to ${chosen}`;
  if (code === "ENOSPC") return "There is no room left on that disk.";
  return cause instanceof Error ? cause.message : "The backup could not be written.";
};

/**
 * Deletes our own oldest files until `keep` remain.
 *
 * A failure here is not a failed export — the file the author cares about is
 * already on disk — so it is swallowed and reported as nothing pruned rather
 * than thrown. The next run tries again.
 */
const prune = async (chosen: string, keep: number): Promise<number> => {
  try {
    const ours = (await readdir(chosen))
      .filter((name) => AUTO_EXPORT_FILE.test(name))
      .sort();
    const doomed = ours.slice(0, Math.max(0, ours.length - keep));
    for (const name of doomed) await rm(path.join(chosen, name), { force: true });
    return doomed.length;
  } catch {
    return 0;
  }
};
