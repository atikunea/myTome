import type { FieldDefinition } from "./ElementType";
import type { ImageSource } from "./Tome";
import { documentText } from "../lexical/blocks";
export interface Element {
  id: string;
  tomeId: string;
  elementTypeId: string;
  name: string;
  /**
   * `JSON.stringify(editorState)` — Lexical's serialized document, the same
   * shape `WriteItem.content` holds. It was plain text until schema v9; nothing
   * reads it as text any more, which is what the two mirrors below are for.
   */
  description: string;
  /**
   * Plain text of `description`, recomputed on every save. It exists so the
   * element cards never parse Lexical JSON to show a preview, and so "does this
   * element have a description?" is a string check rather than a document walk.
   * A cache, never authored — `services/elements.ts` is its only writer.
   */
  descriptionText: string;
  /**
   * Everything readable on this element as one plain string — name, description,
   * and every custom field's value, prose ones flattened. The list page filters
   * on it per keystroke, which is exactly the walk it must not do live once an
   * element can hold several prose fields. Same rules as `descriptionText`: a
   * cache with one writer.
   */
  searchText: string;
  image?: ImageSource;
  attributes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** The name a freshly created element carries until the author renames it. */
export const untitledElement = "Untitled";

/**
 * One field's value as plain text: a prose field is a stored document and has
 * to be flattened, everything else is already text.
 */
export const fieldValueText = (field: FieldDefinition, value: string | undefined) =>
  field.kind === "prose" ? documentText(value ?? "") : (value ?? "");

/**
 * Builds `searchText`. Pure, and shared by the two writers that must agree —
 * `services/elements.ts` on every save, and the v9 backfill in `models/db.ts`
 * — so a migrated row and a saved one are searchable by the same words.
 */
export function elementSearchText(
  element: Pick<Element, "name" | "descriptionText" | "attributes">,
  fields: FieldDefinition[],
): string {
  return [
    element.name,
    element.descriptionText,
    ...fields.map((field) => fieldValueText(field, element.attributes[field.id])),
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}
