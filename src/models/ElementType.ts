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
export const starterTypes = [
  ["Theme", "The ideas and motifs that shape your story"],
  ["Character", "The people who bring this story to life"],
  ["Place", "Locations, regions, and settings"],
  ["Event", "Important events and turning points"],
  ["Prop", "Objects with a story of their own"],
] as const;
