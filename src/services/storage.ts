/**
 * Asking the browser to keep this origin's data durably.
 *
 * IndexedDB defaults to a *best-effort* tier that a browser may evict when
 * space runs short, and which some privacy settings clear after a stretch
 * without a visit. For an app whose only copy of an author's manuscript is that
 * database, that default is the wrong one: `navigator.storage.persist()` moves
 * the origin to the durable tier, where data is kept until the user clears it
 * themselves.
 *
 * It is a request, not a guarantee, and it is not a substitute for a backup —
 * `pages/BackupPage.tsx` is still the only copy that survives a cleared
 * browser. It also touches no table, which is why this sits beside
 * `images.ts` as a named export off the barrel rather than a member of `store`.
 *
 * **When it is asked matters.** Chrome decides silently from how engaged the
 * user seems; Firefox raises a permission prompt. Asking on a cold page load
 * would put that prompt in front of someone who has not yet written a word, so
 * `TomesProvider` asks only once a library holds a tome — by then there is
 * something to lose, and the answer is more likely to be yes.
 */

/**
 * One attempt. Exported for the tests; callers want `requestPersistentStorage`,
 * whose memo keeps the ask to once per page load.
 */
export async function persistStorage(): Promise<boolean> {
  // Absent in older browsers, in insecure contexts, and under `node` in the
  // test environment — a browser that cannot be asked simply stays best-effort.
  const manager = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!manager?.persist || !manager.persisted) return false;
  try {
    // Asking again once granted would re-prompt in Firefox for an answer we
    // already have, so the already-durable case must short-circuit.
    if (await manager.persisted()) return true;
    return await manager.persist();
  } catch {
    // A refusal is not an error worth surfacing: the app works either way, and
    // there is nothing an author could do about it.
    return false;
  }
}

let asked: Promise<boolean> | undefined;

/**
 * Ask once per page load, however many callers there are. The memo is what
 * makes this safe under `StrictMode`, which mounts every effect twice.
 */
export function requestPersistentStorage(): Promise<boolean> {
  return (asked ??= persistStorage());
}
