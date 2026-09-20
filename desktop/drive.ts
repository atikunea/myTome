import { shell } from "electron";

import type { DriveRequestInit, DriveResponse, DriveSession } from "./bridge.js";
import { configured, credentials } from "./credentials.js";
import {
  buildAuthUrl,
  createPkcePair,
  createState,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  startLoopback,
  type TokenSet,
} from "./oauth.js";
import * as vault from "./vault.js";

/**
 * The Drive session, and the only place in this application a Google token
 * exists.
 *
 * The renderer asks for calls; this makes them. That indirection is the point:
 * an XSS in the renderer can ask for a Drive call while the app is running,
 * but there is no token in that process to carry away — which is strictly
 * better than the web app, where a token sits in a module variable for an
 * hour.
 *
 * The access token lives in memory here and nowhere else. The refresh token
 * goes to `vault.ts`, encrypted by the OS or not written at all.
 */

/**
 * From the environment in development, from the bundle in a packaged build —
 * never from a file in the repository. See `credentials.ts` for why a client
 * secret shipped inside an installed app is not a secret, and what actually
 * protects the exchange.
 *
 * Absent, the Drive UI stays a description of a feature this build does not
 * have — exactly as the web app behaves without `VITE_GOOGLE_CLIENT_ID`.
 */
const { clientId, clientSecret } = credentials;

export { configured };

/**
 * The only hosts this process will call on the renderer's behalf.
 *
 * `request` takes a URL the renderer chose, which is the widest thing the
 * preload exposes. Without this check it would be an open proxy with the
 * author's Google token attached to it.
 */
const ALLOWED_PREFIXES = [
  "https://www.googleapis.com/drive/v3/",
  "https://www.googleapis.com/upload/drive/v3/",
];

let tokens: TokenSet | null = null;
let refreshToken: string | undefined;
let account: string | undefined;
let needsReconnect = false;
let loaded = false;

/** Read once, lazily: `app.getPath` is not available before `app.ready`. */
const ensureLoaded = () => {
  if (loaded) return;
  loaded = true;
  refreshToken = vault.load();
};

const currentState = (): DriveSession["state"] => {
  if (needsReconnect) return "needs-reconnect";
  ensureLoaded();
  return tokens || refreshToken ? "connected" : "disconnected";
};

export const session = (): DriveSession => ({
  state: currentState(),
  account,
  canStaySignedIn: vault.canPersist(),
});

const forget = () => {
  tokens = null;
  refreshToken = undefined;
  account = undefined;
  vault.clear();
};

/**
 * A usable access token, refreshing when the one in hand has expired.
 *
 * When the refresh itself fails the grant is gone — revoked in the account,
 * expired, or invalidated by a password change. The stored token is dropped
 * and the session goes to `needs-reconnect`, which the UI has to surface.
 * Never a retry loop: nothing here can fix it but the author.
 */
const accessToken = async (): Promise<string> => {
  ensureLoaded();
  if (tokens && tokens.expiresAt > Date.now()) return tokens.accessToken;
  if (!refreshToken) throw new Error("Not connected to Google Drive.");

  try {
    tokens = await refreshAccessToken({ clientId, clientSecret, refreshToken });
    // Google usually re-issues without one; keep the old one when it does.
    if (tokens.refreshToken) {
      refreshToken = tokens.refreshToken;
      vault.save(refreshToken);
    }
    needsReconnect = false;
    return tokens.accessToken;
  } catch {
    forget();
    needsReconnect = true;
    throw new Error("Google Drive needs you to sign in again.");
  }
};

/**
 * Names the signed-in account without asking for an identity scope: Drive's
 * own `about` endpoint accepts `drive.file`. Best effort — a build that cannot
 * read it shows "Connected" and loses nothing.
 */
const readAccount = async (token: string): Promise<string | undefined> => {
  try {
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
      user?: { emailAddress?: string; displayName?: string };
    };
    return body.user?.emailAddress ?? body.user?.displayName;
  } catch {
    return undefined;
  }
};

/**
 * The installed-app flow, start to finish. Opens the author's real browser —
 * never a `BrowserWindow`, which Google refuses and which would hide the
 * address bar from someone being asked for their Google password.
 */
export const authorize = async (): Promise<DriveSession> => {
  if (!configured) throw new Error("Google Drive isn't set up in this build.");
  ensureLoaded();

  const { verifier, challenge } = createPkcePair();
  const state = createState();
  const loopback = await startLoopback(state);

  try {
    await shell.openExternal(
      buildAuthUrl({ clientId, redirectUri: loopback.redirectUri, challenge, state }),
    );
    const code = await loopback.waitForCode();
    tokens = await exchangeCode({
      clientId,
      clientSecret,
      code,
      verifier,
      redirectUri: loopback.redirectUri,
    });
  } finally {
    // The listener exists for one redirect and closes whatever happened.
    loopback.close();
  }

  needsReconnect = false;
  if (tokens.refreshToken) {
    refreshToken = tokens.refreshToken;
    vault.save(refreshToken);
  }
  account = await readAccount(tokens.accessToken);
  return session();
};

export const revoke = async (): Promise<void> => {
  const held = tokens?.accessToken ?? refreshToken;
  forget();
  needsReconnect = false;
  if (held) await revokeToken(held);
};

/**
 * One Drive call on the renderer's behalf.
 *
 * A 401 is answered by dropping the access token, getting a fresh one, and
 * retrying **once** — silently, with no window and no prompt. That silence is
 * the feature the whole desktop build was for.
 */
export const request = async (
  url: string,
  init?: DriveRequestInit,
): Promise<DriveResponse> => {
  if (!ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    throw new Error("That address is not part of the Drive API.");
  }

  const send = async (token: string) =>
    fetch(url, {
      method: init?.method ?? "GET",
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      body: init?.body,
    });

  let response = await send(await accessToken());
  if (response.status === 401) {
    tokens = null;
    response = await send(await accessToken());
  }

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => (headers[key] = value));
  return { status: response.status, headers, body: await response.text() };
};
