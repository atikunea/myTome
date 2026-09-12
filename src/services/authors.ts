import { db } from "../models/db";
import type { Author } from "../models/Author";
import { authorDescription, untitledAuthor } from "../models/Author";
import { now, observe, uid } from "./internal";

/**
 * Takes a byline off every tome that credits it, inside the caller's
 * transaction (which must include `db.tomes`). The tome row is touched — its
 * `updatedAt` moves — because losing its author is a change to the book, and a
 * sync compares tomes by exactly that high-water mark.
 */
const uncredit = async (authorId: string) => {
  const time = now();
  await db.tomes
    .filter((tome) => tome.authorId === authorId)
    .modify((tome) => {
      delete tome.authorId;
      tome.updatedAt = time;
    });
};

/**
 * Author profiles: the library of bylines a tome can be credited to. See
 * `models/Author.ts` for why a profile is a byline rather than a person or a
 * part of one tome.
 *
 * The page that edits one is `ElementPage`'s arrangement again, so these are the
 * same three mutations: a draft created at the click site, a patch re-read
 * inside its transaction, and a sweep for a draft left untouched.
 */
export const authorStore = {
  /** Every profile, by name. */
  observeAuthors(callback: (v: Author[]) => void) {
    return observe(() => db.authors.orderBy("name").toArray(), callback);
  },
  /** One profile, for the page that shows it. `null` once it is gone. */
  observeAuthor(id: string, callback: (v: Author | null) => void) {
    return observe(async () => (await db.authors.get(id)) ?? null, callback);
  },
  /**
   * A profile created at the click site and opened on its real id — never by a
   * `/authors/new` route, whose create-on-mount effect would fire twice under
   * `StrictMode` and leave an orphan behind every click. `createDraftElement`'s
   * rule, for its reason.
   *
   * `creditTomeId` credits the new profile to a tome in the same transaction,
   * which is what the overview's "New author…" does: two writes would let the
   * profile page open on an author the book did not yet name.
   */
  async createDraftAuthor(creditTomeId?: string) {
    const time = now();
    const author: Author = {
      id: uid(),
      name: untitledAuthor,
      ...authorDescription(""),
      createdAt: time,
      updatedAt: time,
    };
    await db.transaction("rw", db.authors, db.tomes, async () => {
      await db.authors.put(author);
      if (creditTomeId)
        await db.tomes.update(creditTomeId, { authorId: author.id, updatedAt: time });
    });
    return author;
  },
  /**
   * The profile page's write: one field at a time, on the autosave debounce. A
   * **patch, re-read inside the transaction**, for `updateElement`'s reason —
   * several fields write to one row, and merging against the row the page last
   * observed would revert the field saved a moment before whenever a live
   * query's echo was still in flight.
   *
   * A pen name that is blank is dropped rather than stored as `""`, so "no pen
   * name" has one representation and `authorByline` falls back to the name.
   */
  async updateAuthor(
    id: string,
    patch: Partial<Pick<Author, "name" | "pseudonym" | "description" | "image">>,
  ) {
    return db.transaction("rw", db.authors, async () => {
      const existing = await db.authors.get(id);
      if (!existing) throw new Error("That author no longer exists.");
      const merged = { ...existing, ...patch };
      const author: Author = {
        ...merged,
        name: merged.name.trim(),
        pseudonym: merged.pseudonym?.trim() || undefined,
        ...authorDescription(merged.description),
        updatedAt: now(),
      };
      if (!author.name) throw new Error("An author needs a name.");
      await db.authors.put(author);
      return author;
    });
  },
  /**
   * Drops a draft opened and left untouched — default name, no pen name, no
   * bio, no photo.
   *
   * **Credits do not save it.** "New author…" on the overview credits the draft
   * to the tome at the click, so a draft abandoned there is credited and still
   * blank; keeping it would leave a book by "New author". It goes, and the
   * credit goes with it.
   */
  async discardAuthorIfBlank(id: string) {
    await db.transaction("rw", db.authors, db.tomes, async () => {
      const author = await db.authors.get(id);
      if (!author) return;
      if (author.name.trim() !== untitledAuthor) return;
      if (author.pseudonym || author.descriptionText.trim() || author.image) return;
      await uncredit(id);
      await db.authors.delete(id);
    });
  },
  /**
   * Deletes the profile and takes it off every tome crediting it. Nothing else
   * goes: a tome is not *part* of its author, so this is one row and some
   * pointers, not a cascade.
   */
  async deleteAuthor(id: string) {
    await db.transaction("rw", db.authors, db.tomes, async () => {
      await uncredit(id);
      await db.authors.delete(id);
    });
  },
};
