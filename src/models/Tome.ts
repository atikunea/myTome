import { documentText, isProseDocument, plainToLexical } from "../lexical/blocks";

export type TomeStatus = "Draft" | "Completed" | "Archived";
export type ImageSource =
  | {
      kind: "url";
      url: string;
    }
  | {
      kind: "local";
      blob: Blob;
    };
export interface Tome {
  id: string;
  title: string;
  subtitle?: string;
  /**
   * `JSON.stringify(editorState)` — Lexical's serialized document, the same
   * shape `Element.description` holds. It was plain text until schema v10, when
   * the overview page became a page you read with every field edited where it
   * sits; nothing reads it as text any more, which is what the mirror below is
   * for.
   */
  description: string;
  /**
   * Plain text of `description`, recomputed on every save. It exists so the
   * library cards never parse Lexical JSON to show a preview, and so "does this
   * tome have a description?" is a string check rather than a document walk.
   * A cache, never authored — `services/tomes.ts` is its only writer.
   */
  descriptionText: string;
  coverImage?: ImageSource;
  /**
   * The `Author` this book is credited to — which byline its title page
   * carries. Optional since schema v11, and a dangling id is read as "no
   * author": profiles live in a library-level table, and a single-tome backup
   * restored into a browser that never saw its author is a real way to get one.
   */
  authorId?: string;
  status: TomeStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

/**
 * A stored description and the mirror derived from it. Shared by the two
 * writers that must agree — `services/tomes.ts` on every save, and the v10
 * backfill in `models/db.ts` — so a migrated row and a saved one read alike.
 *
 * Plain text is trimmed on the way in and a document is passed through
 * untouched: trimming a document would mean editing its JSON.
 */
export function tomeDescription(value: string | undefined): {
  description: string;
  descriptionText: string;
} {
  const description =
    value && isProseDocument(value) ? value : plainToLexical((value ?? "").trim());
  return { description, descriptionText: documentText(description) };
}
