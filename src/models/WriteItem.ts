export type WriteItemType = "snippet" | "lore" | "passage" | "chapter";

export const writeItemTypes: WriteItemType[] = [
  "snippet",
  "lore",
  "passage",
  "chapter",
];

export const writeItemTypeLabels: Record<WriteItemType, string> = {
  snippet: "Snippet",
  lore: "Lore",
  passage: "Passage",
  chapter: "Chapter",
};

export interface WriteItem {
  id: string;
  tomeId: string;
  title: string;
  type: WriteItemType;
  /** `JSON.stringify(editorState)` — Lexical's serialized document. */
  content: string;
  /**
   * Plain-text excerpt recomputed on every save. It exists so the list's hover
   * preview never has to parse Lexical JSON, and so "is this draft empty?" is a
   * string check rather than a document walk.
   */
  preview: string;
  createdAt: string;
  updatedAt: string;
}

/** The title a freshly created draft carries until the author renames it. */
export const untitledWriteItem = "Untitled";

/** Longest excerpt kept in `preview`; a few lines is all the hover card shows. */
export const previewLength = 240;

/**
 * A serialized Lexical document holding one empty paragraph. New rows store this
 * rather than `""` so the editor always has something well-formed to parse.
 */
export const emptyWriteItemContent = JSON.stringify({
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

/**
 * True when a row is still an untouched draft — default title, no text. Used to
 * discard items the author opened and abandoned without typing anything.
 */
export const isBlankWriteItem = (item: Pick<WriteItem, "title" | "preview">) =>
  item.title.trim() === untitledWriteItem && !item.preview.trim();
