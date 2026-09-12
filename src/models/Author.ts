import { asProseDocument, documentText } from "../lexical/blocks";
import type { ImageSource } from "./Tome";

/**
 * A **byline** — the name a book is published under, and the bio and photo
 * that travel with it. Not a person, and not a tome.
 *
 * The shape comes from how books are actually credited. Most authors keep one
 * byline across every book they write, so a series shares one profile rather
 * than retyping its bio per volume — which is why this is a library-level table
 * and a tome merely points at a row. But one person often holds several: Nora
 * Roberts is also J.D. Robb, J.K. Rowling is also Robert Galbraith, each with a
 * bio of its own. And one byline can be several people — James S. A. Corey is
 * two. So the unit is the byline: an author with two pen names has two rows
 * here, both carrying the same `name`.
 */
export interface Author {
  id: string;
  /** The author's own name. Required — it is what the list is sorted by. */
  name: string;
  /**
   * The pen name, when the byline is not the author's own name. Absent means
   * the name *is* the byline — see `authorByline`.
   */
  pseudonym?: string;
  /**
   * `JSON.stringify(editorState)` — the "About the author" text, a Lexical
   * document exactly like `Tome.description`.
   */
  description: string;
  /** Plain text of `description`. A cache — `services/authors.ts` is its only writer. */
  descriptionText: string;
  /** The author photo. */
  image?: ImageSource;
  createdAt: string;
  updatedAt: string;
}

/** What a draft is called until the author names it — and how an untouched one is recognised. */
export const untitledAuthor = "New author";

/**
 * What a book says on its title page: the pen name, or the author's own name
 * when there is no pen name. One rule, so the title page, the picker on the
 * overview and the profile card cannot disagree about who wrote the book.
 */
export const authorByline = (author: Pick<Author, "name" | "pseudonym">) =>
  author.pseudonym?.trim() || author.name.trim();

/**
 * A stored bio and the mirror derived from it. `asProseDocument` turns a blank
 * string into an empty document and passes a real one through untouched, so a
 * hand-edited backup and a save from the editor land in the same shape.
 */
export function authorDescription(value: string | undefined): {
  description: string;
  descriptionText: string;
} {
  const description = asProseDocument(value ?? "");
  return { description, descriptionText: documentText(description) };
}
