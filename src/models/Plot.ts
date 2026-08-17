export type PlotDotColor =
  | "grey"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info";
export type PlotDotVariant = "filled" | "outlined";
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
