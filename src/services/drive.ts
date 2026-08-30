import { parseBackup, store } from "./store";
import type { BackupFile } from "./store";
import { planSync } from "./syncPlan";
import type { LocalTome, RemoteTome, SyncPlan } from "./syncPlan";

/**
 * Google Drive as a place to keep the backup files — the app's one and only
 * network dependency, and an optional one.
 *
 * This is **transport, not format**: every byte that moves is a `BackupFile`
 * from `backup.ts`, arriving through the same `parseBackup` a hand-picked file
 * goes through, and merging through the same `restoreBackup(file, "merge")`.
 * Drive holds one file per tome, so a typo in one book does not rewrite the
 * library, and a conflict is scoped to the book it happened in.
 *
 * Rules this module is built around, all of them security-shaped:
 *
 * - **The token never leaves memory.** No `localStorage`, no IndexedDB, no
 *   cookie. It expires in about an hour and there is no refresh token, which is
 *   a feature: the blast radius of an XSS is one session, not forever.
 * - **`drive.file` is the only scope**, so the app can touch files it created
 *   and nothing else in the user's Drive. Because that grant follows the OAuth
 *   client rather than the browser, the file this app wrote in Chrome is the
 *   same file it can read in Firefox — which is the entire trick behind syncing
 *   without a server.
 * - **Google's script is loaded on demand**, at the moment the author first
 *   asks to connect — not on page load. Someone who never touches Drive never
 *   runs third-party code.
 * - **A sync only ever merges.** `restoreBackup(…, "replace")` stays a
 *   deliberate, confirmed act on a file a human picked. Nothing automatic is
 *   allowed to wipe a library.
 * - **Nothing is ever deleted from Drive**, and no upload overwrites a file that
 *   changed since the plan was made. See `syncPlan.ts` for what that costs.
 */

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

/**
 * Whether this build carries an OAuth client id at all. Without one the Drive
 * UI stays a description of what it would do — no dead buttons, and a fork of
 * this repo is never quietly talking to someone else's Google project.
 */
export const driveConfigured = Boolean(clientId);

/** Per-file access to files this app created. Nothing else in the user's Drive. */
const scope = "https://www.googleapis.com/auth/drive.file";
const gisUrl = "https://accounts.google.com/gsi/client";
const apiRoot = "https://www.googleapis.com/drive/v3";
const uploadRoot = "https://www.googleapis.com/upload/drive/v3";
const folderName = "myTome";
const folderMime = "application/vnd.google-apps.folder";
const lastSyncKey = "myTome.drive.lastSyncAt";

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

export const isConnected = () => token !== null;

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
            response.error_description ??
              response.error ??
              "Google did not grant access.",
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

export const connect = async () => {
  await authorize();
};

/**
 * Hands the token back to Google and forgets it. Revoking rather than merely
 * dropping it is the honest reading of "disconnect" — the next connect asks for
 * consent again, which is the point.
 */
export const disconnect = async () => {
  const held = token;
  token = null;
  if (!held) return;
  await new Promise<void>((resolve) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) return resolve();
    oauth2.revoke(held, () => resolve());
  });
};

const request = async (url: string, init?: RequestInit): Promise<Response> => {
  const send = async () =>
    fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
  let response = await send();
  if (response.status === 401) {
    // The hour is up. One silent retry — Google usually re-issues without a
    // prompt for a grant already given.
    token = null;
    await authorize();
    response = await send();
  }
  if (response.ok) return response;
  const detail = await response
    .json()
    .then((body: { error?: { message?: string } }) => body.error?.message)
    .catch(() => undefined);
  throw new Error(
    response.status === 403
      ? (detail ?? "Google refused the request. It may be a rate limit — try again shortly.")
      : (detail ?? `Google Drive returned ${response.status}.`),
  );
};

const json = async <T>(url: string, init?: RequestInit): Promise<T> =>
  (await request(url, init)).json() as Promise<T>;

/** The app's folder in the user's Drive, made on first use. */
const folder = async () => {
  const query = `name = '${folderName}' and mimeType = '${folderMime}' and trashed = false`;
  const found = await json<{ files: { id: string }[] }>(
    `${apiRoot}/files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=drive`,
  );
  if (found.files?.[0]) return found.files[0].id;
  const made = await json<{ id: string }>(`${apiRoot}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: folderName, mimeType: folderMime }),
  });
  return made.id;
};

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  appProperties?: { tomeId?: string; touchedAt?: string };
}

/**
 * What is in the folder, and which tome each file holds — read from
 * `appProperties`, Drive's private-to-the-app metadata, so a plan can be made
 * without downloading a single manuscript.
 */
const listRemote = async (folderId: string): Promise<RemoteTome[]> => {
  const query = `'${folderId}' in parents and trashed = false`;
  const listed = await json<{ files: DriveFile[] }>(
    `${apiRoot}/files?q=${encodeURIComponent(query)}` +
      "&fields=files(id,name,modifiedTime,appProperties)&spaces=drive&pageSize=1000",
  );
  return (listed.files ?? []).map((file) => ({
    fileId: file.id,
    tomeId: file.appProperties?.tomeId ?? "",
    touchedAt: file.appProperties?.touchedAt ?? "",
    modifiedTime: file.modifiedTime,
  }));
};

const download = async (fileId: string) =>
  (await request(`${apiRoot}/files/${fileId}?alt=media`)).text();

const multipart = (metadata: object, body: string) => {
  const boundary = `mytome-${crypto.randomUUID()}`;
  return {
    boundary,
    payload: [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      body,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  };
};

const fileNameFor = (title: string) =>
  `${title.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "tome"}.mytome.json`;

/**
 * Writes one tome's file. When it already exists the file's `modifiedTime` is
 * re-read first and the write is abandoned if Drive moved underneath the plan —
 * a read-modify-write with a check, which narrows the race rather than closing
 * it. The next sync sees the newer file and pulls it.
 */
const upload = async (
  folderId: string,
  file: BackupFile,
  tome: LocalTome,
  existing?: RemoteTome,
) => {
  const metadata: Record<string, unknown> = {
    name: fileNameFor(tome.title),
    mimeType: "application/json",
    appProperties: { tomeId: tome.id, touchedAt: tome.touchedAt },
  };
  if (existing) {
    const current = await json<DriveFile>(
      `${apiRoot}/files/${existing.fileId}?fields=modifiedTime`,
    );
    if (current.modifiedTime !== existing.modifiedTime) return false;
  } else metadata.parents = [folderId];
  const { boundary, payload } = multipart(metadata, JSON.stringify(file));
  await request(
    existing
      ? `${uploadRoot}/files/${existing.fileId}?uploadType=multipart&fields=id`
      : `${uploadRoot}/files?uploadType=multipart&fields=id`,
    {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: payload,
    },
  );
  return true;
};

export interface SyncReport {
  pulled: string[];
  pushed: string[];
  matched: number;
  /** Tomes skipped because Drive changed mid-sync; run again to settle them. */
  raced: string[];
  duplicates: number;
  at: string;
}

/**
 * One round trip: list, plan, then move only what the plan names.
 *
 * Pulls run before pushes so that a tome newer in Drive is merged in before its
 * own high-water mark is compared again — and because a pull is the half that
 * can lose work if it goes wrong, it is the half that runs while the local copy
 * is still untouched.
 */
export const syncNow = async (): Promise<SyncReport> => {
  await authorize();
  const folderId = await folder();
  const remote = await listRemote(folderId);
  const local = await store.tomeMarks();
  const plan: SyncPlan = planSync(local, remote);
  const byTome = new Map(remote.map((file) => [file.tomeId, file]));
  const titleOf = new Map(local.map((tome) => [tome.id, tome.title]));
  const report: SyncReport = {
    pulled: [],
    pushed: [],
    matched: plan.matched.length,
    raced: [],
    duplicates: plan.duplicates.length,
    at: new Date().toISOString(),
  };

  for (const file of plan.pull) {
    const backup = parseBackup(await download(file.fileId));
    const result = await store.restoreBackup(backup, "merge");
    const title = backup.tomes[0]?.tome.title ?? titleOf.get(file.tomeId) ?? "A tome";
    // `kept` means the local copy turned out to be newer after all — the file
    // was stale by the time it landed. Nothing was lost; the push below sends
    // this browser's copy up instead.
    if (result.kept) report.raced.push(title);
    else report.pulled.push(title);
  }

  for (const tome of plan.push) {
    const file = await store.exportTomeBackup(tome.id);
    const written = await upload(folderId, file, tome, byTome.get(tome.id));
    if (written) report.pushed.push(tome.title);
    else report.raced.push(tome.title);
  }

  rememberSync(report.at);
  return report;
};

/**
 * When this browser last finished a sync. Kept in `localStorage` because it is
 * a convenience, not a credential — nothing here is worth stealing.
 */
export const lastSyncAt = () => {
  try {
    return window.localStorage.getItem(lastSyncKey) ?? undefined;
  } catch {
    return undefined;
  }
};

const rememberSync = (at: string) => {
  try {
    window.localStorage.setItem(lastSyncKey, at);
  } catch {
    // Private mode, or storage the browser has locked down. A forgotten
    // timestamp is cosmetic; syncing itself does not depend on it.
  }
};
