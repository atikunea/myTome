import { BrowserWindow, dialog } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BridgeFileFilter } from "./bridge.js";

/**
 * Native open and save dialogs.
 *
 * **The renderer never names a path**, only a suggested filename — where a
 * file lands is whatever the dialog returned. That is what makes writing safe
 * without the allowlist `drive.ts` needs: the author picked the destination,
 * in their own operating system's dialog, and a page cannot reach past it.
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
