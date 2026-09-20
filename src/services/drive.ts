import { authorByline } from "../models/Author";
import { transport } from "#driveTransport";
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
 * and so cannot be settled inside any one of them (see `syncPlan.ts`). The
 * library's writing goals are a third unit for exactly that reason: one row
 * every book's activity page reads, so carried inside tome files a goal changed
 * in one browser would never reach another that happened to hold newer prose.
 *
 * **Getting a token is not in this file.** How the author signs in, where the
 * token is kept, and who attaches it to a request are the only parts of Drive
 * that differ between the web app and the desktop build, and they live behind
 * `driveTransport.ts` — which is also where those rules are now written down.
 * Everything else about Drive is here and is the same on both.
 *
 * - **`drive.file` is the only scope**, so the app can touch files it created
 *   and nothing else in the user's Drive. Because that grant follows the OAuth
 *   client rather than the browser, the file this app wrote in Chrome is the
 *   same file it can read in Firefox — which is the entire trick behind syncing
 *   without a server. It is also why `about?fields=user` is allowed to name the
 *   signed-in account without asking for an identity scope.
 * - **A sync only ever merges.** `restoreBackup(…, "replace")` stays a
 *   deliberate, confirmed act on a file a human picked. Nothing automatic is
 *   allowed to wipe a library.
 * - **Nothing is ever deleted from Drive**, and no upload overwrites a file that
 *   changed since the plan was made. See `syncPlan.ts` for what that costs.
 */

/**
 * Whether this build can reach Drive at all.
 *
 * On the web that means an OAuth client id compiled into the bundle; on the
 * desktop it means the shell exposed its Drive bridge. Without it the Drive UI
 * stays a description of what it would do — no dead buttons, and a fork of
 * this repo is never quietly talking to someone else's Google project.
 */
export const driveConfigured = transport.configured;

/** Cached state and the account, for a card that has to render synchronously. */
export const driveState = () => transport.state();
export const driveAccount = () => transport.accountLabel();
export const canStaySignedIn = () => transport.canStaySignedIn();

/** Picks up a session the platform may already hold. Call once, on mount. */
export const resumeDrive = () => transport.resume();

export const isConnected = () => transport.state() === "connected";
export const connect = () => transport.connect();
export const disconnect = () => transport.disconnect();

const apiRoot = "https://www.googleapis.com/drive/v3";
const uploadRoot = "https://www.googleapis.com/upload/drive/v3";
const folderName = "myTome";
const folderMime = "application/vnd.google-apps.folder";
const lastSyncKey = "myTome.drive.lastSyncAt";

/**
 * One Drive call, and what to say when it goes wrong.
 *
 * Getting a token, keeping it, and retrying once when it has expired all
 * belong to the transport — they are the only part of this that differs
 * between the web app and the desktop build. What is left here is Drive's own
 * vocabulary of failure, which is the same on both.
 */
const request = async (url: string, init?: RequestInit): Promise<Response> => {
  const response = await transport.request(url, init);
  if (response.ok) return response;
  const detail = await response
    .json()
    .then((body: { error?: { message?: string } }) => body.error?.message)
    .catch(() => undefined);
  throw new Error(
    response.status === 401
      ? "Google Drive needs you to sign in again."
      : response.status === 403
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

/** The three kinds of file in the folder. Each is planned on its own. */
type Kind = "tome" | "author" | "goals";

/**
 * Which `appProperties` key names the unit a file holds. A tome file has
 * carried `tomeId` since sync shipped; a profile file carries `authorId`
 * instead, and the writing goals carry `goalsId`, which is also what keeps an
 * older build — whose planner skips any file without a `tomeId` — from
 * mistaking either for a tome.
 */
const idKey = { tome: "tomeId", author: "authorId", goals: "goalsId" } as const;

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  appProperties?: {
    tomeId?: string;
    authorId?: string;
    goalsId?: string;
    touchedAt?: string;
  };
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
  const copies: Record<Kind, RemoteCopy[]> = { tome: [], author: [], goals: [] };
  for (const file of listed.files ?? []) {
    const kind: Kind = file.appProperties?.authorId
      ? "author"
      : file.appProperties?.goalsId
        ? "goals"
        : "tome";
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

/**
 * `The Long Road.mytome.json`, `J.D. Robb.author.mytome.json` for a profile, or
 * `Writing goals.goals.mytome.json` for the goals.
 */
const suffixFor = { tome: "", author: ".author", goals: ".goals" } as const;
const fileNameFor = (kind: Kind, title: string) => {
  const base = title.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || kind;
  return `${base}${suffixFor[kind]}.mytome.json`;
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
  /** The library's writing goals — at most one thing, moving or not. */
  goals: SyncMoves;
  /** Tomes, profiles and goals alike that already matched. */
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
    const title =
      name ??
      nameOf.get(file.id) ??
      { tome: "A tome", author: "A profile", goals: "Writing goals" }[kind];
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
  // Only when there is no session to use. On the web this is the pop-up, and
  // it needs the click that got here; on the desktop a connected session is
  // already in hand, and calling `connect` unconditionally would throw the
  // system browser in the author's face on every sync.
  if (transport.state() !== "connected") await transport.connect();
  const folderId = await folder();
  const remote = await listRemote(folderId);
  const localAuthors = await store.authorMarks();
  const localTomes = await store.tomeMarks();
  const localGoals = await store.goalsMarks();
  const authorPlan = planSync(localAuthors, remote.author);
  const tomePlan = planSync(localTomes, remote.tome);
  const goalsPlan = planSync(localGoals, remote.goals);
  const at = new Date().toISOString();

  const authors = await carryOut(folderId, "author", authorPlan, remote.author, localAuthors, {
    exportCopy: (id) => store.exportAuthorBackup(id),
    merged: (file, result) => ({
      name: file.authors[0] && authorByline(file.authors[0]),
      kept: result.authors.kept > 0,
    }),
  });
  // The goals travel with the profiles, before any tome: they are one row that
  // every book's page reads, so a pulled goal should already be here when the
  // tomes that will be measured against it arrive.
  const goals = await carryOut(folderId, "goals", goalsPlan, remote.goals, localGoals, {
    exportCopy: () => store.exportGoalsBackup(),
    merged: (_file, result) => ({ name: "Writing goals", kept: result.goals === "keep" }),
  });
  const tomes = await carryOut(folderId, "tome", tomePlan, remote.tome, localTomes, {
    exportCopy: (id) => store.exportTomeBackup(id),
    merged: (file, result) => ({ name: file.tomes[0]?.tome.title, kept: result.kept > 0 }),
  });

  rememberSync(at);
  return {
    tomes,
    authors,
    goals,
    matched:
      tomePlan.matched.length + authorPlan.matched.length + goalsPlan.matched.length,
    duplicates:
      tomePlan.duplicates.length +
      authorPlan.duplicates.length +
      goalsPlan.duplicates.length,
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
