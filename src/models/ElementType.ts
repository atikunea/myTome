/**
 * What a custom field holds. `text` is a line, `select` is one of the field's
 * own choices, and `prose` is a Lexical document — the same rich text the
 * description is, so an author can give a type as many written sections as
 * their world needs (a Character's Appearance and Backstory, a Place's
 * History) rather than piling everything into one description.
 *
 * A `prose` value is stored in `Element.attributes` like any other, because a
 * serialized document is a string. Two consequences: anything that renders an
 * attribute as text has to flatten it first (`fieldValueText`), and anything
 * asking whether a value is empty has to parse it (`isEmptyFieldValue`) — an
 * empty document is a long non-empty string.
 */
export type FieldKind = "text" | "select" | "prose";
export interface FieldDefinition {
  id: string;
  name: string;
  kind: FieldKind;
  options?: string[];
  required: boolean;
  sortOrder: number;
}
export interface ElementType {
  id: string;
  tomeId: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  fieldDefinitions: FieldDefinition[];
  createdAt: string;
  updatedAt: string;
}
// The set a new tome starts with is no longer a constant here: it is the
// "General" entry in `TomeTemplate.ts`, alongside the genre templates.
