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
 * The surface below is deliberately tiny. `docs/desktop-app.md` lists what it
 * grows into — dialogs, Drive, backup writing — and the rule that goes with
 * it: every member is enumerated and added on purpose. Nothing generic is ever
 * exposed here, and in particular never `ipcRenderer` itself, which would hand
 * the renderer the whole IPC channel and make the sandbox decorative.
 *
 * Phase 1 exposes only facts about the host, so that `contextIsolation` can be
 * proven to work end to end before anything worth stealing crosses it.
 */

import type { DriveBridge, DriveRequestInit, FilesBridge } from "./bridge.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

/**
 * Four named calls, and never `ipcRenderer` itself — handing the renderer the
 * whole IPC channel would make the sandbox decorative.
 *
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
  // Omitted entirely when the build has no credentials, which is what the
  // renderer reads as "Drive is not part of this build".
  ...(process.env["MYTOME_DRIVE_CONFIGURED"] ? { drive } : {}),
};

contextBridge.exposeInMainWorld("myTome", api);
