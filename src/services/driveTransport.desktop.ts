import type { DriveRequestInit, DriveSession, MyTomeBridge } from "../../desktop/bridge";
import type { DriveState, DriveTransport } from "./driveTransport";

/**
 * The desktop half of Drive: none of it happens here.
 *
 * Every call in this file is a message to the main process, which holds the
 * tokens, runs the installed-app OAuth flow in the system browser, and makes
 * the actual request. **The renderer never sees an access token or a refresh
 * token**, which is the whole reason this goes through IPC rather than calling
 * googleapis directly — an XSS in the tab can ask for a Drive call while the
 * app is running, but has nothing to carry away.
 *
 * It is also why the desktop CSP can keep `connect-src 'self'`: this process
 * never talks to Google at all.
 *
 * See `desktop/drive.ts` for the other end, and `desktop/vault.ts` for where
 * the refresh token is kept.
 */

const bridge = (globalThis as { myTome?: MyTomeBridge }).myTome;
const drive = () => {
  if (!bridge?.drive) throw new Error("The desktop bridge is not available.");
  return bridge.drive;
};

/**
 * What the main process last told us. Cached so that rendering stays
 * synchronous — `resume()` and the mutating calls are what move it.
 */
let session: DriveSession = { state: "disconnected", canStaySignedIn: false };

/**
 * `RequestInit` is richer than anything that can cross IPC, and richer than
 * `drive.ts` uses: every call it makes has a plain-object header bag and a
 * string body. Anything else would be a new caller doing something this seam
 * has not been asked to carry, and dropping it silently would be worse than
 * the type error that should have stopped it.
 */
const toBridgeInit = (init?: RequestInit): DriveRequestInit | undefined => {
  if (!init) return undefined;
  const headers: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) init.headers.forEach((v, k) => (headers[k] = v));
    else if (Array.isArray(init.headers)) for (const [k, v] of init.headers) headers[k] = v;
    else Object.assign(headers, init.headers);
  }
  if (init.body !== undefined && typeof init.body !== "string") {
    throw new Error("The desktop Drive bridge carries text bodies only.");
  }
  return { method: init.method, headers, body: init.body };
};

export const transport: DriveTransport = {
  configured: Boolean(bridge?.drive),

  state: (): DriveState => (bridge?.drive ? session.state : "unconfigured"),

  resume: async (): Promise<DriveState> => {
    if (!bridge?.drive) return "unconfigured";
    session = await drive().session();
    return session.state;
  },

  accountLabel: () => session.account,

  canStaySignedIn: () => session.canStaySignedIn,

  connect: async () => {
    session = await drive().authorize();
  },

  disconnect: async () => {
    await drive().revoke();
    session = { state: "disconnected", canStaySignedIn: session.canStaySignedIn };
  },

  request: async (url, init) => {
    const response = await drive().request(url, toBridgeInit(init));

    // The main process refreshes and retries on its own; a 401 reaching here
    // means the refresh itself failed, and the grant is gone. Say so, rather
    // than letting the card go on claiming it is connected.
    if (response.status === 401) session = { ...session, state: "needs-reconnect" };

    // These statuses may not carry a body, and `Response` throws if given one.
    const bodyless =
      response.status === 204 || response.status === 205 || response.status === 304;
    return new Response(bodyless ? null : response.body, {
      status: response.status,
      headers: response.headers,
    });
  },
};
