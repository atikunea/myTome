/**
 * The bridge between the locked-down renderer and the shell.
 *
 * **This file is `.cts`, and that matters.** The window runs with
 * `sandbox: true`, and Electron only supports CommonJS preload scripts in a
 * sandbox — an ES module preload silently requires turning the sandbox off.
 * TypeScript gives a `.cts` source a `.cjs` output under `module: nodenext`,
 * which is how the sandbox and `"type": "module"` in `package.json` coexist
 * without a bundler.
 *
 * The surface below is deliberately tiny, and `docs/desktop-app.md` lists it
 * in full. The rule that goes with it: every member is enumerated and added on
 * purpose. Nothing generic is ever exposed here, and in particular never
 * `ipcRenderer` itself, which would hand the renderer the whole IPC channel
 * and make the sandbox decorative.
 *
 * The through-line across all of it is that **the renderer names no path and
 * holds no credential.** It asks for a dialog, or for a Drive call, or for an
 * export, and gets back a result — never a token, never a location.
 */

import type { BackupBridge, DriveBridge, DriveRequestInit, FilesBridge } from "./bridge.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

/**
 * Note what is *not* here: anything that returns a token. The renderer asks
 * the main process to make a Drive call and gets the response back; the
 * credential never crosses this boundary in either direction.
 */
const drive: DriveBridge = {
  authorize: () => ipcRenderer.invoke("drive:authorize"),
  session: () => ipcRenderer.invoke("drive:session"),
  revoke: () => ipcRenderer.invoke("drive:revoke"),
  request: (url: string, init?: DriveRequestInit) =>
    ipcRenderer.invoke("drive:request", url, init),
};

/**
 * Always present, unlike `drive`: a build with no Google credentials still
 * saves backups and opens cover images.
 */
const files: FilesBridge = {
  save: (request) => ipcRenderer.invoke("files:save", request),
  open: (options) => ipcRenderer.invoke("files:open", options),
};

/**
 * Note what `write` does *not* take: a folder, or a filename. The renderer
 * hands over bytes and a retention count, and the main process decides where
 * it lands and what it is called — which is what lets that process delete old
 * exports without ever deleting something a page named.
 */
const backup: BackupBridge = {
  folder: () => ipcRenderer.invoke("backup:folder"),
  chooseFolder: () => ipcRenderer.invoke("backup:chooseFolder"),
  forgetFolder: () => ipcRenderer.invoke("backup:forgetFolder"),
  write: (request) => ipcRenderer.invoke("backup:write", request),
};

const api = {
  /** Present only in the desktop build. The web build leaves `window.myTome` undefined. */
  isDesktop: true as const,
  platform: process.platform,
  versions: {
    app: process.env["MYTOME_APP_VERSION"] ?? "0.0.0",
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  files,
  backup,
  // Omitted entirely when the build has no credentials, which is what the
  // renderer reads as "Drive is not part of this build".
  ...(process.env["MYTOME_DRIVE_CONFIGURED"] ? { drive } : {}),
};

contextBridge.exposeInMainWorld("myTome", api);
