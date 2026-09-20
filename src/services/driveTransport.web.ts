import type { DriveState, DriveTransport } from "./driveTransport";

/**
 * The browser's half of Drive: Google Identity Services, a pop-up, and a token
 * that lives for about an hour.
 *
 * This is the flow the web app has always used, lifted out of `drive.ts`
 * unchanged, and the security rules it is built around are unchanged with it:
 *
 * - **The token never leaves memory.** No `localStorage`, no IndexedDB, no
 *   cookie. It expires in about an hour and there is no refresh token, which
 *   is a feature: the blast radius of an XSS is one session, not forever.
 * - **`drive.file` is the only scope**, so the app can touch files it created
 *   and nothing else in the user's Drive. Because that grant follows the OAuth
 *   client rather than the browser, the file this app wrote in Chrome is the
 *   same file it can read in Firefox — the entire trick behind syncing with no
 *   server.
 * - **Google's script is loaded on demand**, when the author first asks to
 *   connect, never at page load. Someone who never touches Drive never runs
 *   third-party code.
 *
 * The desktop build gets a refresh token and does none of this; see
 * `driveTransport.desktop.ts`.
 */

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

/** Per-file access to files this app created. Nothing else in the user's Drive. */
const scope = "https://www.googleapis.com/auth/drive.file";
const gisUrl = "https://accounts.google.com/gsi/client";

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}
interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

/** In memory for the life of the tab, and nowhere else. */
let token: string | null = null;
let client: TokenClient | null = null;
let pending: {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
} | null = null;
let loadingGis: Promise<void> | null = null;

const loadGis = () =>
  (loadingGis ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement("script");
    script.src = gisUrl;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later attempt try again rather than caching the failure forever.
      loadingGis = null;
      reject(new Error("Could not reach Google to sign in. Check your connection."));
    };
    document.head.append(script);
  }));

const tokenClient = async () => {
  if (client) return client;
  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google's sign-in script did not load.");
  client = oauth2.initTokenClient({
    client_id: clientId,
    scope,
    // One client, reused; each request parks its promise in `pending` because
    // the callback is fixed when the client is built.
    callback: (response) => {
      const settle = pending;
      pending = null;
      if (response.access_token) settle?.resolve(response.access_token);
      else
        settle?.reject(
          new Error(
            response.error_description ?? response.error ?? "Google did not grant access.",
          ),
        );
    },
    error_callback: (error) => {
      const settle = pending;
      pending = null;
      settle?.reject(
        new Error(
          error.type === "popup_closed"
            ? "Sign-in was closed before it finished."
            : "Google sign-in could not start. A pop-up blocker may be in the way.",
        ),
      );
    },
  });
  return client;
};

/**
 * Gets a usable token, asking Google only when there isn't one. Call from a
 * click: the consent pop-up needs a user gesture behind it.
 */
const authorize = async () => {
  if (token) return token;
  if (!clientId) throw new Error("Google Drive isn't set up in this build.");
  const gis = await tokenClient();
  token = await new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    // An empty prompt means "don't ask again if they've already agreed".
    gis.requestAccessToken({ prompt: "" });
  });
  return token;
};

export const transport: DriveTransport = {
  configured: Boolean(clientId),

  state: (): DriveState =>
    !clientId ? "unconfigured" : token !== null ? "connected" : "disconnected",

  // Nothing survives a reload here: the token lives in a module variable, and
  // the tab taking it with it is the design.
  resume: async () => (token !== null ? "connected" : clientId ? "disconnected" : "unconfigured"),

  // A pop-up token says nothing about who it belongs to, and finding out would
  // cost a round trip on every render. The card simply says "Connected", as it
  // always has.
  accountLabel: () => undefined,

  canStaySignedIn: () => false,

  connect: async () => {
    await authorize();
  },

  /**
   * Revoking rather than merely dropping the token is the honest reading of
   * "disconnect" — the next connect asks for consent again, which is the point.
   */
  disconnect: async () => {
    const held = token;
    token = null;
    if (!held) return;
    await new Promise<void>((resolve) => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) return resolve();
      oauth2.revoke(held, () => resolve());
    });
  },

  request: async (url, init) => {
    const send = async () =>
      fetch(url, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      });
    const response = await send();
    if (response.status !== 401) return response;
    // The hour is up. One silent retry — Google usually re-issues without a
    // prompt for a grant already given.
    token = null;
    await authorize();
    return send();
  },
};
