import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
} from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { DriveRequestInit } from "./bridge.js";
import * as drive from "./drive.js";
import * as files from "./files.js";
import { buildApplicationMenu } from "./menu.js";

/**
 * The myTome desktop shell.
 *
 * This process owns a window and talks to the operating system. It holds no
 * application state — no tomes, no plots, no database — and it never parses a
 * backup file. Everything the app *is* still runs in the renderer, on Dexie,
 * exactly as it does on the web. See docs/desktop-app.md, "The main process is
 * not a backend".
 *
 * What it does own is the lockdown, the two things the renderer is not allowed
 * to do for itself — spend a Google token, write to a disk — and one decision
 * that cannot be taken back.
 */

/**
 * **These two strings are permanent.**
 *
 * Chromium keys IndexedDB by origin, so `mytome://app` is the physical
 * location of every author's library — `<userData>/IndexedDB/` holds a
 * directory named after it. Changing the scheme or the host orphans every
 * library already on disk into a folder the app can no longer see, which is
 * indistinguishable from total data loss and recoverable only by hand.
 *
 * `app.getName()` (from `package.json`) is the third string of this kind,
 * because it decides `userData` itself.
 *
 * Treat all three the way `models/db.ts` treats a shipped `.version(n)` block:
 * additive changes only, never edits.
 */
const SCHEME = "mytome";
const HOST = "app";
const APP_ORIGIN = `${SCHEME}://${HOST}`;

/** Where `npm run dev` serves the renderer. Only consulted under `--dev`. */
const DEV_SERVER_URL = "http://localhost:5173";

/**
 * Mirrors `background.default` in `src/theme.ts`, light and dark. The main
 * process cannot read the MUI theme, and painting the window its real colour
 * before the renderer attaches is the difference between opening a book and
 * opening a white flash. If the palette moves, move these with it.
 */
const PAPER_LIGHT = "#fdfbf8";
const PAPER_DARK = "#1c1815";

/**
 * Stricter than the web policy in `vite.config.ts`, and it gets to be: the
 * desktop renderer never loads Google's sign-in script and never calls an API
 * itself. From phase 2 on, Drive requests are made by *this* process, so
 * `connect-src` stays `'self'` even once sync works — the renderer has no
 * token to spend and nothing to send.
 *
 * `img-src https:` is for cover images pasted as URLs; `style-src
 * 'unsafe-inline'` is unavoidable with emotion, which is how MUI styles every
 * component.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join("; ");

const isDev = process.argv.includes("--dev");

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.resolve(here, "..", "dist");
const preloadPath = path.join(here, "preload.cjs");

/**
 * Registered before `app.ready`, which is the only time Electron accepts it.
 * `standard` gives the scheme a real origin (without it there is no stable
 * storage key at all); `secure` makes it a secure context, which IndexedDB and
 * `navigator.storage.persist()` both want.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/**
 * The renderer may hand us any URL; this is the only door out of the app.
 * Anything that is not https is refused rather than sanitised — `file:`,
 * `javascript:` and custom schemes have no legitimate caller here.
 */
const openExternal = (target: string): void => {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return;
  }
  if (url.protocol !== "https:") return;
  void shell.openExternal(url.toString());
};

/**
 * Serves the built bundle over `mytome://app`.
 *
 * There is no SPA fallback here and none is needed: the app is a `HashRouter`,
 * so every route is `index.html` plus a fragment, and a fragment never reaches
 * a request handler. That is the subpath problem GitHub Pages forced on the
 * web build paying for itself a second time.
 */
const serveRenderer = (): void => {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) {
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    }

    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = path.resolve(rendererRoot, relative);

    // This is not a file server. Anything resolving outside the bundle is a
    // bug or an attack, never a request worth answering.
    if (target !== rendererRoot && !target.startsWith(rendererRoot + path.sep)) {
      return new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } });
    }

    return net.fetch(pathToFileURL(target).toString());
  });
};

const hardenSession = (): void => {
  const target = session.defaultSession;

  // Build only, for the same reason `vite.config.ts` says: the dev server
  // needs inline scripts, `eval` and a websocket, and a policy strict enough
  // to be worth shipping would break all three.
  if (!isDev) {
    target.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [CONTENT_SECURITY_POLICY],
        },
      });
    });
  }

  // Deny everything except durable storage — which is `services/storage.ts`
  // asking, and on the desktop the answer should simply be yes.
  const allowed = (permission: string) => permission === "persistent-storage";
  target.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowed(permission));
  });
  target.setPermissionCheckHandler((_contents, permission) => allowed(permission));
};

/**
 * Everything the renderer may ask of the shell.
 *
 * Nothing here trusts the caller beyond the fact that it is our own page. The
 * checked sender keeps a frame that somehow loaded something else from
 * spending the author's Google token or writing to their disk; beyond that,
 * `drive.ts` validates every URL, and `files.ts` never takes a path from the
 * renderer at all.
 */
const registerIpc = (): void => {
  const fromOurPage = (url: string) =>
    url.startsWith(APP_ORIGIN) || (isDev && url.startsWith(DEV_SERVER_URL));

  const handle = <T>(channel: string, run: (...args: never[]) => Promise<T> | T) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!fromOurPage(event.senderFrame?.url ?? "")) {
        throw new Error("Refused: unexpected sender.");
      }
      return run(...(args as never[]));
    });
  };

  handle("drive:session", () => drive.session());
  handle("drive:authorize", () => drive.authorize());
  handle("drive:revoke", () => drive.revoke());
  handle("drive:request", (url: string, init?: DriveRequestInit) => drive.request(url, init));

  handle("files:save", (request: Parameters<typeof files.save>[0]) => files.save(request));
  handle("files:open", (options: Parameters<typeof files.open>[0]) => files.open(options));

  handle("backup:folder", () => files.folder());
  handle("backup:chooseFolder", () => files.chooseFolder());
  handle("backup:forgetFolder", () => files.forgetFolder());
  handle("backup:write", (request: Parameters<typeof files.write>[0]) => files.write(request));
};

const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? PAPER_DARK : PAPER_LIGHT,
    title: app.getName(),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Paint once, rather than showing an empty frame and then the app.
  win.once("ready-to-show", () => win.show());

  // Nothing opens a second window. A target="_blank" or a window.open becomes
  // a system-browser visit, or nothing at all.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  // A hash change does not fire this event, so the router never trips it; what
  // does reach here is an <a href> to somewhere real, and it leaves the app.
  win.webContents.on("will-navigate", (event, target) => {
    const sameOrigin = target.startsWith(APP_ORIGIN) || (isDev && target.startsWith(DEV_SERVER_URL));
    if (sameOrigin) return;
    event.preventDefault();
    openExternal(target);
  });

  void win.loadURL(isDev ? DEV_SERVER_URL : `${APP_ORIGIN}/index.html`);
  return win;
};

/**
 * Two instances sharing one `userData` means two Chromium profiles opening the
 * same LevelDB, which is how an author's library gets corrupted rather than
 * merely confused. The second launch hands focus to the first and exits.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (!existing) return;
    if (existing.isMinimized()) existing.restore();
    existing.focus();
  });

  // Read by the sandboxed preload, which inherits this process's environment.
  process.env["MYTOME_APP_VERSION"] = app.getVersion();
  // Whether to expose the Drive bridge at all. Without credentials the card
  // stays a description of a feature this build does not have — no dead
  // buttons, exactly as the web app behaves without a client id.
  process.env["MYTOME_DRIVE_CONFIGURED"] = drive.configured ? "1" : "";

  void app.whenReady().then(() => {
    serveRenderer();
    hardenSession();
    registerIpc();
    Menu.setApplicationMenu(buildApplicationMenu({ appName: app.getName(), openExternal, isDev }));
    createWindow();

    // macOS keeps the process alive with no windows; clicking the dock icon
    // is how it asks for one back.
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
