/**
 * Deciding what a sync should do — the whole of it, with no network and no DOM.
 *
 * `drive.ts` can only be exercised by driving a real browser against a real
 * Google account, so everything that is a *decision* rather than a request lives
 * here instead, the same split `hooks/autosave.ts` and `lexical/blocks.ts` make.
 * The rule this file exists to keep honest: **a sync compares one number per
 * tome and never inspects contents.** That number is `touchedAt`, the tome's
 * high-water mark from `backup.ts`, which is why a plan can be made from a Drive
 * file listing alone — no downloads until something is known to be stale.
 */

/** A tome in this browser, as the planner sees it. */
export interface LocalTome {
  id: string;
  title: string;
  touchedAt: string;
}

/** One backup file in the Drive folder, from the listing's `appProperties`. */
export interface RemoteTome {
  fileId: string;
  tomeId: string;
  touchedAt: string;
  /** Drive's own timestamp, re-checked before an upload overwrites the file. */
  modifiedTime: string;
}

export interface SyncPlan {
  /** Files to download and merge in: newer there, or not here at all. */
  pull: RemoteTome[];
  /** Tomes to upload: newer here, or never uploaded. */
  push: LocalTome[];
  /** Tomes where both sides already agree — nothing to do. */
  matched: LocalTome[];
  /**
   * Extra Drive files claiming a tome another file already claims. Two browsers
   * that first synced at the same moment can each create one. The newer wins and
   * the rest are left untouched: deleting someone's manuscript to tidy up a
   * listing is not a trade this app makes.
   */
  duplicates: RemoteTome[];
}

/**
 * Works out which way each tome should move. Ties do nothing, which is what
 * makes syncing twice in a row cost one listing and no transfers.
 *
 * Note what is *absent*: nothing is ever deleted. A tome deleted here but still
 * in Drive is simply "not here", so the next sync brings it back — sync has no
 * way to tell a deletion from a browser that has never seen it. Removing a tome
 * for good means deleting its Drive file too, and the UI says so.
 */
export const planSync = (
  local: readonly LocalTome[],
  remote: readonly RemoteTome[],
): SyncPlan => {
  const plan: SyncPlan = { pull: [], push: [], matched: [], duplicates: [] };

  // Newest file wins its tome; the rest are recorded and otherwise ignored.
  const newest = new Map<string, RemoteTome>();
  for (const file of remote) {
    if (!file.tomeId || !file.touchedAt) continue;
    const held = newest.get(file.tomeId);
    if (!held) {
      newest.set(file.tomeId, file);
      continue;
    }
    const [winner, loser] =
      file.touchedAt > held.touchedAt ? [file, held] : [held, file];
    newest.set(file.tomeId, winner);
    plan.duplicates.push(loser);
  }

  const here = new Map(local.map((tome) => [tome.id, tome]));
  for (const tome of local) {
    const file = newest.get(tome.id);
    if (!file) plan.push.push(tome);
    else if (file.touchedAt > tome.touchedAt) plan.pull.push(file);
    else if (file.touchedAt < tome.touchedAt) plan.push.push(tome);
    else plan.matched.push(tome);
  }
  for (const [tomeId, file] of newest)
    if (!here.has(tomeId)) plan.pull.push(file);

  return plan;
};

/** True when a plan would move nothing — the "already up to date" case. */
export const planIsEmpty = (plan: SyncPlan) =>
  !plan.pull.length && !plan.push.length;
