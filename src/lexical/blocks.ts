import {
  IS_BOLD,
  IS_CODE,
  IS_HIGHLIGHT,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
} from "lexical";

/**
 * Reads a stored Lexical document into a plain descriptor tree, so a
 * `WriteItem` can be drawn without mounting an editor for it.
 *
 * **This file holds no React and touches no DOM**, for the same reason
 * `hooks/autosave.ts` does not: the bugs worth catching here — the format
 * bitmask, list nesting, a checked item — are all in the mapping, and the
 * mapping can then be driven from the suite's `node` environment. The component
 * that turns these descriptors into MUI markup (`components/StaticProse.tsx`)
 * is deliberately thin enough not to need a test of its own.
 *
 * The node vocabulary is closed and ours: `initialConfig` in the editor lists
 * exactly `HeadingNode`, `QuoteNode`, `ListNode`, `ListItemNode`, `LinkNode` and
 * `MentionNode`, plus core paragraph/text/linebreak. It is not an open registry
 * the way `ElementType` is. **Anything added there has to be taught to this
 * file** — see `unknownFallback` below for what happens when it is not.
 */

export type InlineFormat =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code"
  | "highlight"
  | "subscript"
  | "superscript";

/**
 * The bits Lexical packs into a text node's `format`. Taken from the library's
 * own exported constants rather than written out as numbers, so a change
 * upstream cannot silently desynchronize the reader from the editor.
 */
const formatBits: readonly (readonly [InlineFormat, number])[] = [
  ["bold", IS_BOLD],
  ["italic", IS_ITALIC],
  ["underline", IS_UNDERLINE],
  ["strikethrough", IS_STRIKETHROUGH],
  ["code", IS_CODE],
  ["highlight", IS_HIGHLIGHT],
  ["subscript", IS_SUBSCRIPT],
  ["superscript", IS_SUPERSCRIPT],
];

export type Inline =
  | { kind: "text"; text: string; formats: InlineFormat[] }
  | { kind: "mention"; text: string; formats: InlineFormat[]; elementId: string }
  | { kind: "link"; url: string; children: Inline[] }
  | { kind: "break" };

/** `ElementFormatType` as Lexical serializes it — `""` meaning "inherit". */
export type Align = "" | "left" | "center" | "right" | "justify" | "start" | "end";

export type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type ListKind = "bullet" | "number" | "check";

export type ListEntry = {
  /** Present only on a check list; `undefined` elsewhere rather than `false`. */
  checked?: boolean;
  /** Lexical's 1-based ordinal, which survives an interrupted numbered list. */
  value: number;
  content: Inline[];
  /** Nested lists, which Lexical stores as children of the list *item*. */
  children: Block[];
};

export type Block =
  | { kind: "paragraph"; align: Align; indent: number; content: Inline[] }
  | { kind: "heading"; tag: HeadingTag; align: Align; indent: number; content: Inline[] }
  | { kind: "quote"; align: Align; indent: number; content: Inline[] }
  | { kind: "list"; listType: ListKind; start: number; indent: number; entries: ListEntry[] };

type RawNode = Record<string, unknown>;

const asArray = (value: unknown): RawNode[] =>
  Array.isArray(value) ? (value.filter((x) => x && typeof x === "object") as RawNode[]) : [];

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const alignments: readonly Align[] = ["left", "center", "right", "justify", "start", "end"];
const asAlign = (value: unknown): Align =>
  alignments.includes(value as Align) ? (value as Align) : "";

const headingTags: readonly HeadingTag[] = ["h1", "h2", "h3", "h4", "h5", "h6"];
const listKinds: readonly ListKind[] = ["bullet", "number", "check"];

/** Node types this reader draws as blocks rather than as inline content. */
const blockTypes = new Set(["paragraph", "heading", "quote", "list", "listitem"]);

export function formatsOf(format: unknown): InlineFormat[] {
  const bits = asNumber(format);
  return formatBits.filter(([, bit]) => (bits & bit) !== 0).map(([name]) => name);
}

function toInlines(nodes: RawNode[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const type = asString(node.type);

    if (type === "linebreak") {
      out.push({ kind: "break" });
      continue;
    }

    if (type === "link" || type === "autolink") {
      out.push({
        kind: "link",
        url: asString(node.url),
        children: toInlines(asArray(node.children)),
      });
      continue;
    }

    // Mentions extend TextNode, so they carry `text` and `format` like any
    // other run and differ only by the id they denormalize alongside the name.
    if (typeof node.text === "string") {
      const formats = formatsOf(node.format);
      if (type === "mention") {
        out.push({
          kind: "mention",
          text: node.text,
          formats,
          elementId: asString(node.elementId),
        });
      } else {
        out.push({ kind: "text", text: node.text, formats });
      }
      continue;
    }

    // An unrecognized inline wrapper still yields whatever it wraps, so an
    // unknown node loses its styling rather than its content.
    out.push(...toInlines(asArray(node.children)));
  }
  return out;
}

function toListEntries(nodes: RawNode[]): ListEntry[] {
  const entries: ListEntry[] = [];
  for (const node of nodes) {
    if (asString(node.type) !== "listitem") continue;
    const children = asArray(node.children);
    // A list item holding a nested list keeps that list as a child; everything
    // else in it is the item's own inline content.
    const nested = children.filter((child) => asString(child.type) === "list");
    const inline = children.filter((child) => asString(child.type) !== "list");
    entries.push({
      ...(typeof node.checked === "boolean" ? { checked: node.checked } : {}),
      value: asNumber(node.value, entries.length + 1),
      content: toInlines(inline),
      children: toBlocks(nested),
    });
  }
  return entries;
}

function toBlocks(nodes: RawNode[]): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    const type = asString(node.type);
    const align = asAlign(node.format);
    const indent = asNumber(node.indent);
    const children = asArray(node.children);

    switch (type) {
      case "paragraph":
        out.push({ kind: "paragraph", align, indent, content: toInlines(children) });
        break;
      case "heading": {
        const tag = asString(node.tag, "h1");
        out.push({
          kind: "heading",
          tag: headingTags.includes(tag as HeadingTag) ? (tag as HeadingTag) : "h1",
          align,
          indent,
          content: toInlines(children),
        });
        break;
      }
      case "quote":
        out.push({ kind: "quote", align, indent, content: toInlines(children) });
        break;
      case "list": {
        const listType = asString(node.listType, "bullet");
        out.push({
          kind: "list",
          listType: listKinds.includes(listType as ListKind) ? (listType as ListKind) : "bullet",
          start: asNumber(node.start, 1),
          indent,
          entries: toListEntries(children),
        });
        break;
      }
      // A bare list item outside a list has no list to belong to; drawing its
      // content as a paragraph keeps the words rather than dropping them.
      case "listitem":
        out.push({ kind: "paragraph", align, indent, content: toInlines(children) });
        break;
      default:
        out.push(...unknownFallback(children, align, indent));
    }
  }
  return out;
}

/**
 * What a node type this reader has never heard of degrades to. It keeps the
 * author's words on screen at the cost of the node's own semantics: a wrapper
 * full of blocks is unwrapped, and anything else becomes a paragraph. Silent
 * loss is the failure mode worth engineering against here — a node added to the
 * editor's `initialConfig` and forgotten here would otherwise render as nothing
 * at all.
 */
function unknownFallback(children: RawNode[], align: Align, indent: number): Block[] {
  if (!children.length) return [];
  if (children.some((child) => blockTypes.has(asString(child.type))))
    return toBlocks(children);
  const content = toInlines(children);
  return content.length ? [{ kind: "paragraph", align, indent, content }] : [];
}

/**
 * Parses `WriteItem.content` — `JSON.stringify(editorState)` — into blocks.
 * Anything unparseable yields an empty document rather than throwing, so a
 * corrupt row degrades to a blank section instead of blanking the manuscript.
 */
export function lexicalToBlocks(content: string): Block[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const root = (parsed as RawNode).root;
  if (!root || typeof root !== "object") return [];
  return toBlocks(asArray((root as RawNode).children));
}

function inlinesText(inlines: Inline[]): string {
  return inlines
    .map((inline) => {
      if (inline.kind === "break") return "\n";
      if (inline.kind === "link") return inlinesText(inline.children);
      return inline.text;
    })
    .join("");
}

/**
 * The document's plain text, one line per block. Used for word counts and for
 * the stored `preview`, so neither has to walk Lexical JSON twice.
 */
export function blocksText(blocks: Block[]): string {
  const lines: string[] = [];
  const walk = (list: Block[]) => {
    for (const block of list) {
      if (block.kind === "list") {
        for (const entry of block.entries) {
          lines.push(inlinesText(entry.content));
          walk(entry.children);
        }
      } else {
        lines.push(inlinesText(block.content));
      }
    }
  };
  walk(blocks);
  return lines.join("\n");
}

/** Words in a plain-text run, counted the way a manuscript word count is. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
