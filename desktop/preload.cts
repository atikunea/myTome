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

const { contextBridge } = require("electron") as typeof import("electron");

const api = {
  /** Present only in the desktop build. The web build leaves `window.myTome` undefined. */
  isDesktop: true as const,
  platform: process.platform,
  versions: {
    app: process.env["MYTOME_APP_VERSION"] ?? "0.0.0",
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
} as const;

contextBridge.exposeInMainWorld("myTome", api);

export type MyTomeBridge = typeof api;
