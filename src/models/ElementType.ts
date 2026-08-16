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
  ["Theme", "The ideas and motifs that shape your story", "Star"],
  ["Character", "The people who bring this story to life", "Person"],
  ["Place", "Locations, regions, and settings", "LocationOn"],
  ["Event", "Important events and turning points", "Event"],
  ["Prop", "Objects with a story of their own", "Inventory2"],
] as const;
