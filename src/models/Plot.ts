export type PlotDotColor =
  | "grey"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info";
export type PlotDotVariant = "filled" | "outlined";
/**
 * One slot on a tome's shared story spine. Rows belong to the tome, not to a
 * plot: every plot's beats map onto the same ordered list, which is what lets
 * two or more plots be drawn as an aligned grid, and what makes a gap
 * expressible — a gap is simply a row that a plot has no beat in.
 */
export interface PlotRow {
  id: string;
  tomeId: string;
  /** Optional author-written name for the row: "Act I", "Day 12", "Chapter 3". */
  label?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface Plot {
  id: string;
  tomeId: string;
  name: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface PlotItem {
  id: string;
  tomeId: string;
  plotId: string;
  name: string;
  title: string;
  description: string;
  icon?: string;
  dotColor?: PlotDotColor;
  dotVariant?: PlotDotVariant;
  attachedElementIds: string[];
  /**
   * The row of the tome's shared spine this beat occupies. Every beat sits on a
   * row, so that alignment never has to guess. `sortOrder` below is derived from
   * it: row order is the truth, and a beat's index within its own plot is
   * recomputed whenever rows or row assignments change.
   */
  plotRowId: string;
  /**
   * The beat's composed manuscript text, in author-chosen reading order. Unlike
   * `attachedElementIds` the order is meaningful — it is the order the passages
   * are read in — and the same WriteItem may be composed into several beats.
   * Always an array, never undefined (Dexie's multiEntry index requires it).
   */
  writeItemIds: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export const plotDotColors: PlotDotColor[] = [
  "grey",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
];
