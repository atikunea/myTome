export type TomeStatus = "Draft" | "Completed" | "Archived";
export type ImageSource =
  | {
      kind: "url";
      url: string;
    }
  | {
      kind: "local";
      blob: Blob;
    };
export interface Tome {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  coverImage?: ImageSource;
  status: TomeStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}
