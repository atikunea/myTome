import type { FieldDefinition } from "../models/ElementType";
import { documentText } from "../lexical/blocks";

/**
 * Validation lives outside the mutations on purpose: a form calls the validator
 * itself before saving, so the thrown message can be rendered as the dialog's
 * inline error rather than surfacing as a failed write. Keep that split when
 * adding entities — the mutation assumes it was given valid input.
 */

export function validateFields(fields: FieldDefinition[]) {
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const field of fields) {
    if (!field.id.trim() || ids.has(field.id))
      throw new Error("Each field needs a unique identifier.");
    ids.add(field.id);
    const name = field.name.trim().toLocaleLowerCase();
    if (!name || names.has(name))
      throw new Error("Field names must be unique and not blank.");
    names.add(name);
    if (field.kind === "select") {
      const opts = (field.options ?? []).map((x) => x.trim()).filter(Boolean);
      if (
        !opts.length ||
        new Set(opts.map((x) => x.toLocaleLowerCase())).size !== opts.length
      )
        throw new Error(`"${field.name}" needs unique list choices.`);
    }
  }
}

/**
 * Whether a field has been filled in. A `prose` value is a stored document, so
 * emptiness is a question about its text and not about the string: an empty
 * document is several hundred characters of JSON.
 */
export function isEmptyFieldValue(
  field: FieldDefinition,
  value: string | undefined,
) {
  if (field.kind === "prose") return !documentText(value ?? "").trim();
  return !value?.trim();
}

/**
 * Which of a type's required fields this element has yet to fill in.
 *
 * `required` is a **completeness** signal, not a validity one — see
 * `validateElement`. The element page shows what is outstanding; nothing
 * refuses a write over it.
 */
export function missingRequiredFields(
  attributes: Record<string, string>,
  fields: FieldDefinition[],
) {
  return fields.filter(
    (field) => field.required && isEmptyFieldValue(field, attributes[field.id]),
  );
}

/**
 * What must hold for an element to be stored at all.
 *
 * **`required` is deliberately not enforced here.** It was, while an element
 * was only ever written by a form that submitted every field at once. Editing
 * is now per field: rejecting a save because some *other* field is empty would
 * throw away the edit the author just made over one they weren't touching, and
 * an author sketching a character rarely knows its faction on the first day.
 * What remains is what genuinely cannot be stored — a nameless element, or a
 * choice outside its own list — and both are checkable at the field being
 * edited. Completeness is reported by `missingRequiredFields` instead.
 */
export function validateElement(
  name: string,
  attributes: Record<string, string>,
  fields: FieldDefinition[],
) {
  if (!name.trim()) throw new Error("Name is required.");
  for (const field of fields) {
    const value = attributes[field.id]?.trim() ?? "";
    if (
      value &&
      field.kind === "select" &&
      !(field.options ?? []).includes(value)
    )
      throw new Error(`${field.name} must use a listed choice.`);
  }
}

export function validatePlotItem(title: string) {
  if (!title.trim()) throw new Error("Every plot item needs a title.");
}

export function validateRelationship(fromElementId: string, toElementId: string, label: string) {
  if (!label.trim()) throw new Error("Every relationship needs a description.");
  if (fromElementId === toElementId)
    throw new Error("An element cannot be related to itself.");
}
