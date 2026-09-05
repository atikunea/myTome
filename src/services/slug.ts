/**
 * The one slug rule, shared by everything that names a thing after an author's
 * words — an element type's `slug`, a backup file, a manuscript export.
 *
 * Pure and table-free on purpose, so `manuscript.ts` (which reads no table and
 * must stay drivable from `node`) can use it without pulling `internal.ts` and
 * Dexie in behind it. The three call sites had three copies of this regex pair
 * and differed only in what an all-punctuation name falls back to.
 */
export const slugify = (value: string, fallback = "") =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || fallback;
