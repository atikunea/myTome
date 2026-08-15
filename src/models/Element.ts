import type { ImageSource } from "./Tome";
export interface Element {
  id: string;
  tomeId: string;
  elementTypeId: string;
  name: string;
  description: string;
  image?: ImageSource;
  attributes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
