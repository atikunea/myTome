export type FieldKind = "text" | "select";
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
