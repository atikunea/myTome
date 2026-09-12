/**
 * Deciding what a sync should do — the whole of it, with no network and no DOM.
 *
 * `drive.ts` can only be exercised by driving a real browser against a real
 * Google account, so everything that is a *decision* rather than a request lives
 * here instead, the same split `hooks/autosave.ts` and `lexical/blocks.ts` make.
 * The rule this file exists to keep honest: **a sync compares one number per
 * unit and never inspects contents.** For a tome that number is `touchedAt`,
 * its high-water mark from `backup.ts`; for an author profile it is the row's
 * own `updatedAt`. Either way a plan can be made from a Drive file listing
 * alone — no downloads until something is known to be stale.
 *
 * **A unit is a tome or an author profile, and the planner does not know
 * which.** Each has its own file in Drive and `drive.ts` plans the two kinds
 * separately, so a profile is never compared against a tome. A profile is its
 * own unit rather than part of the tomes that credit it because it is shared by
 * all of them: carried only inside tome files, a bio edited in one browser
 * would never reach another that had newer prose in the same book — that
 * browser would push, never pull, and both would then report "matched" while
 * holding different bios.
 */

/** A tome or a profile in this browser, as the planner sees it. */
export interface LocalCopy {
  id: string;
  title: string;
  touchedAt: string;
}

/** One backup file in the Drive folder, from the listing's `appProperties`. */
export interface RemoteCopy {
  fileId: string;
  /** The tome or profile the file holds. */
  id: string;
  touchedAt: string;
  /** Drive's own timestamp, re-checked before an upload overwrites the file. */
  modifiedTime: string;
}

export interface SyncPlan {
  /** Files to download and merge in: newer there, or not here at all. */
  pull: RemoteCopy[];
  /** Units to upload: newer here, or never uploaded. */
  push: LocalCopy[];
  /** Units where both sides already agree — nothing to do. */
  matched: LocalCopy[];
  /**
   * Extra Drive files claiming a unit another file already claims. Two browsers
   * that first synced at the same moment can each create one. The newer wins and
   * the rest are left untouched: deleting someone's manuscript to tidy up a
   * listing is not a trade this app makes.
   */
  duplicates: RemoteCopy[];
}

/**
 * Works out which way each unit should move. Ties do nothing, which is what
 * makes syncing twice in a row cost one listing and no transfers.
 *
 * Note what is *absent*: nothing is ever deleted. A tome deleted here but still
 * in Drive is simply "not here", so the next sync brings it back — sync has no
 * way to tell a deletion from a browser that has never seen it. Removing a tome
 * for good means deleting its Drive file too, and the UI says so. The same
 * holds for a profile.
 */
export const planSync = (
  local: readonly LocalCopy[],
  remote: readonly RemoteCopy[],
): SyncPlan => {
  const plan: SyncPlan = { pull: [], push: [], matched: [], duplicates: [] };

  // Newest file wins its unit; the rest are recorded and otherwise ignored.
  const newest = new Map<string, RemoteCopy>();
  for (const file of remote) {
    if (!file.id || !file.touchedAt) continue;
    const held = newest.get(file.id);
    if (!held) {
      newest.set(file.id, file);
      continue;
    }
    const [winner, loser] =
      file.touchedAt > held.touchedAt ? [file, held] : [held, file];
    newest.set(file.id, winner);
    plan.duplicates.push(loser);
  }

  const here = new Map(local.map((copy) => [copy.id, copy]));
  for (const copy of local) {
    const file = newest.get(copy.id);
    if (!file) plan.push.push(copy);
    else if (file.touchedAt > copy.touchedAt) plan.pull.push(file);
    else if (file.touchedAt < copy.touchedAt) plan.push.push(copy);
    else plan.matched.push(copy);
  }
  for (const [id, file] of newest) if (!here.has(id)) plan.pull.push(file);

  return plan;
};

/** True when a plan would move nothing — the "already up to date" case. */
export const planIsEmpty = (plan: SyncPlan) =>
  !plan.pull.length && !plan.push.length;
