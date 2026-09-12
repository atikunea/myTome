import { authorByline } from "../models/Author";
import { parseBackup, store } from "./store";
import type { BackupFile, RestoreResult } from "./store";
import { planSync } from "./syncPlan";
import type { LocalCopy, RemoteCopy, SyncPlan } from "./syncPlan";

/**
 * Google Drive as a place to keep the backup files — the app's one and only
 * network dependency, and an optional one.
 *
 * This is **transport, not format**: every byte that moves is a `BackupFile`
 * from `backup.ts`, arriving through the same `parseBackup` a hand-picked file
 * goes through, and merging through the same `restoreBackup(file, "merge")`.
 * Drive holds one file per tome, so a typo in one book does not rewrite the
 * library, and a conflict is scoped to the book it happened in — and one file
 * per author profile, because a byline is shared by every tome crediting it
 * and so cannot be settled inside any one of them (see `syncPlan.ts`).
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

/** The two kinds of file in the folder. Each is planned on its own. */
type Kind = "tome" | "author";

/**
 * Which `appProperties` key names the unit a file holds. A tome file has
 * carried `tomeId` since sync shipped; a profile file carries `authorId`
 * instead, which is also what keeps an older build — whose planner skips any
 * file without a `tomeId` — from mistaking one for a tome.
 */
const idKey = { tome: "tomeId", author: "authorId" } as const;

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  appProperties?: { tomeId?: string; authorId?: string; touchedAt?: string };
}

/**
 * What is in the folder, and which tome or profile each file holds — read from
 * `appProperties`, Drive's private-to-the-app metadata, so a plan can be made
 * without downloading a single manuscript.
 */
const listRemote = async (folderId: string): Promise<Record<Kind, RemoteCopy[]>> => {
  const query = `'${folderId}' in parents and trashed = false`;
  const listed = await json<{ files: DriveFile[] }>(
    `${apiRoot}/files?q=${encodeURIComponent(query)}` +
      "&fields=files(id,name,modifiedTime,appProperties)&spaces=drive&pageSize=1000",
  );
  const copies: Record<Kind, RemoteCopy[]> = { tome: [], author: [] };
  for (const file of listed.files ?? []) {
    const kind: Kind = file.appProperties?.authorId ? "author" : "tome";
    copies[kind].push({
      fileId: file.id,
      id: file.appProperties?.[idKey[kind]] ?? "",
      touchedAt: file.appProperties?.touchedAt ?? "",
      modifiedTime: file.modifiedTime,
    });
  }
  return copies;
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

/** `The Long Road.mytome.json`, or `J.D. Robb.author.mytome.json` for a profile. */
const fileNameFor = (kind: Kind, title: string) => {
  const base = title.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || kind;
  return `${base}${kind === "author" ? ".author" : ""}.mytome.json`;
};

/**
 * Writes one tome's or profile's file. When it already exists the file's
 * `modifiedTime` is re-read first and the write is abandoned if Drive moved
 * underneath the plan — a read-modify-write with a check, which narrows the
 * race rather than closing it. The next sync sees the newer file and pulls it.
 */
const upload = async (
  folderId: string,
  kind: Kind,
  file: BackupFile,
  copy: LocalCopy,
  existing?: RemoteCopy,
) => {
  const metadata: Record<string, unknown> = {
    name: fileNameFor(kind, copy.title),
    mimeType: "application/json",
    appProperties: { [idKey[kind]]: copy.id, touchedAt: copy.touchedAt },
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

/** What moved, by name. A profile is named by its byline. */
export interface SyncMoves {
  pulled: string[];
  pushed: string[];
  /** Skipped because Drive changed mid-sync; run again to settle them. */
  raced: string[];
}

export interface SyncReport {
  tomes: SyncMoves;
  authors: SyncMoves;
  /** Tomes and profiles alike that already matched. */
  matched: number;
  duplicates: number;
  at: string;
}

/**
 * Carries out one kind's plan. The two kinds differ only in how a copy is
 * exported and how a merged file is read back, which is all `unit` supplies.
 *
 * Pulls run before pushes so that a unit newer in Drive is merged in before its
 * own mark is compared again — and because a pull is the half that can lose
 * work if it goes wrong, it is the half that runs while the local copy is still
 * untouched.
 */
const carryOut = async (
  folderId: string,
  kind: Kind,
  plan: SyncPlan,
  remote: RemoteCopy[],
  local: LocalCopy[],
  unit: {
    exportCopy: (id: string) => Promise<BackupFile>;
    /** The name a pulled file goes by, and whether its copy was the one kept. */
    merged: (file: BackupFile, result: RestoreResult) => { name?: string; kept: boolean };
  },
): Promise<SyncMoves> => {
  const moves: SyncMoves = { pulled: [], pushed: [], raced: [] };
  const byId = new Map(remote.map((file) => [file.id, file]));
  const nameOf = new Map(local.map((copy) => [copy.id, copy.title]));

  for (const file of plan.pull) {
    const backup = parseBackup(await download(file.fileId));
    const { name, kept } = unit.merged(backup, await store.restoreBackup(backup, "merge"));
    const title = name ?? nameOf.get(file.id) ?? (kind === "tome" ? "A tome" : "A profile");
    // `kept` means the local copy turned out to be newer after all — the file
    // was stale by the time it landed. Nothing was lost; the push below sends
    // this browser's copy up instead.
    (kept ? moves.raced : moves.pulled).push(title);
  }

  for (const copy of plan.push) {
    const file = await unit.exportCopy(copy.id);
    const written = await upload(folderId, kind, file, copy, byId.get(copy.id));
    (written ? moves.pushed : moves.raced).push(copy.title);
  }
  return moves;
};

/**
 * One round trip: list, plan, then move only what the plan names — profiles
 * first, so a tome arriving in the same sync already has its byline here.
 */
export const syncNow = async (): Promise<SyncReport> => {
  await authorize();
  const folderId = await folder();
  const remote = await listRemote(folderId);
  const localAuthors = await store.authorMarks();
  const localTomes = await store.tomeMarks();
  const authorPlan = planSync(localAuthors, remote.author);
  const tomePlan = planSync(localTomes, remote.tome);
  const at = new Date().toISOString();

  const authors = await carryOut(folderId, "author", authorPlan, remote.author, localAuthors, {
    exportCopy: (id) => store.exportAuthorBackup(id),
    merged: (file, result) => ({
      name: file.authors[0] && authorByline(file.authors[0]),
      kept: result.authors.kept > 0,
    }),
  });
  const tomes = await carryOut(folderId, "tome", tomePlan, remote.tome, localTomes, {
    exportCopy: (id) => store.exportTomeBackup(id),
    merged: (file, result) => ({ name: file.tomes[0]?.tome.title, kept: result.kept > 0 }),
  });

  rememberSync(at);
  return {
    tomes,
    authors,
    matched: tomePlan.matched.length + authorPlan.matched.length,
    duplicates: tomePlan.duplicates.length + authorPlan.duplicates.length,
    at,
  };
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
