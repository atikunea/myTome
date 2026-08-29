import type { FieldDefinition } from "../models/ElementType";

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

export function validateElement(
  name: string,
  attributes: Record<string, string>,
  fields: FieldDefinition[],
) {
  if (!name.trim()) throw new Error("Name is required.");
  for (const field of fields) {
    const value = attributes[field.id]?.trim() ?? "";
    if (field.required && !value) throw new Error(`${field.name} is required.`);
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
