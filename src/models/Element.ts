import type { ElementType } from "./ElementType";

export interface Element {
  id: number;
  name: string;
  description: string;
  type: ElementType;
}