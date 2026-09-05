import { Packer } from "docx";
import { describe, expect, it } from "vitest";
import type { Block } from "../../lexical/blocks";
import type { Manuscript, ManuscriptBeat } from "../manuscript";
import { manuscriptDocument, manuscriptParagraphs } from "../manuscriptDocx";

/**
 * The Word mapping, tested where it is ours: which paragraph opens a page, and
 * that each ordered list gets a numbering definition of its own.
 *
 * `docx` builds a paragraph into a tree of `{ rootKey, root }` nodes and exposes
 * no formatter, so the two probes below read that tree. **They are coupled to
 * the library's internals on purpose** — the alternative is unzipping a packed
 * document, which would couple the test to a transitive JSZip instead. If a
 * `docx` upgrade breaks these, fix the probes; they are the test's plumbing, not
 * its subject.
 */

type Node = { rootKey?: string; root?: unknown };

const nodes = (value: unknown): Node[] =>
  Array.isArray(value) ? (value.filter((x) => x && typeof x === "object") as Node[]) : [];

/** Every `rootKey` anywhere under a node, which is enough to spot a flag. */
function keys(node: Node, out: string[] = []): string[] {
  if (node.rootKey) out.push(node.rootKey);
  for (const child of nodes(node.root)) keys(child, out);
  return out;
}

/** Whether a paragraph carries `w:pageBreakBefore` in its properties. */
const breaks = (paragraph: unknown) =>
  keys(paragraph as Node).includes("w:pageBreakBefore");

/**
 * The visible text of a paragraph — every `w:t` under it, joined. A `w:t` holds
 * its text as a bare string beside an attribute node, which is why this walks
 * `root` directly rather than through `nodes`.
 */
function collectText(node: Node, out: string[]): void {
  const children = Array.isArray(node.root) ? node.root : [];
  if (node.rootKey === "w:t") {
    for (const child of children) if (typeof child === "string") out.push(child);
    return;
  }
  for (const child of children)
    if (child && typeof child === "object") collectText(child as Node, out);
}

const textOf = (node: unknown) => {
  const out: string[] = [];
  collectText(node as Node, out);
  return out.join("");
};

const para = (...text: string[]): Block => ({
  kind: "paragraph",
  align: "",
  indent: 0,
  content: text.map((t) => ({ kind: "text", text: t, formats: [] })),
});

const list = (start: number, ...items: string[]): Block => ({
  kind: "list",
  listType: "number",
  start,
  indent: 0,
  entries: items.map((t, i) => ({
    value: start + i,
    content: [{ kind: "text", text: t, formats: [] }],
    children: [],
  })),
});

const beat = (id: string, blocks: Block[], heading?: string): ManuscriptBeat => ({
  beatId: id,
  ...(heading === undefined ? {} : { heading }),
  sections: [{ writeItemId: `w-${id}`, title: id, type: "passage", blocks, words: 0 }],
  words: 0,
});

const manuscript = (beats: ManuscriptBeat[]): Manuscript => ({
  tomeTitle: "The Long Road",
  plotName: "Main plot",
  beats,
  words: 0,
  repeated: [],
  skipped: [],
});

describe("manuscriptParagraphs", () => {
  it("opens a page for every beat but the first", () => {
    const { children } = manuscriptParagraphs([
      beat("b1", [para("one"), para("still one")]),
      beat("b2", [para("two")]),
      beat("b3", [para("three")]),
    ]);

    expect(children.map(breaks)).toEqual([false, false, true, true]);
  });

  it("puts the break on the beat heading when there is one", () => {
    const { children } = manuscriptParagraphs([
      beat("b1", [para("one")], "First"),
      beat("b2", [para("two")], "Second"),
    ]);

    expect(children.map((p) => [textOf(p), breaks(p)])).toEqual([
      ["First", false],
      ["one", false],
      ["Second", true],
      ["two", false],
    ]);
  });

  it("still holds the page when a beat's blocks render to nothing", () => {
    const { children } = manuscriptParagraphs([
      beat("b1", [para("one")]),
      beat("b2", []),
      beat("b3", [para("three")]),
    ]);

    expect(children).toHaveLength(3);
    expect(children.map(breaks)).toEqual([false, true, true]);
  });

  it("does not let a block that renders nothing swallow the page break", () => {
    const emptyList: Block = {
      kind: "list",
      listType: "bullet",
      start: 1,
      indent: 0,
      entries: [],
    };
    const { children } = manuscriptParagraphs([
      beat("b1", [para("one")]),
      beat("b2", [emptyList, para("two")]),
    ]);

    expect(children.map((p) => [textOf(p), breaks(p)])).toEqual([
      ["one", false],
      ["two", true],
    ]);
  });

  it("writes a section shared by two beats into both of them", () => {
    // A text composed into several beats is printed in each — `manuscript.ts`
    // reports the repeat rather than thinning it, and the writer must not
    // second-guess that by collapsing the two.
    const shared: Block = para("the refrain");
    const { children } = manuscriptParagraphs([
      beat("b1", [para("one"), shared]),
      beat("b2", [shared, para("two")]),
    ]);

    expect(children.map(textOf)).toEqual(["one", "the refrain", "the refrain", "two"]);
  });

  it("gives each ordered list its own numbering so starts survive and counts do not bleed", () => {
    const { numbering } = manuscriptParagraphs([
      beat("b1", [list(1, "a", "b"), para("between"), list(7, "c")]),
    ]);

    expect(numbering.map((entry) => entry.reference)).toEqual(["ordered-0", "ordered-1"]);
    expect(numbering.map((entry) => (entry.levels[0] as { start: number }).start)).toEqual([
      1, 7,
    ]);
  });

  it("writes a check item as a box glyph, which Word has no control for", () => {
    const checks: Block = {
      kind: "list",
      listType: "check",
      start: 1,
      indent: 0,
      entries: [
        { checked: true, value: 1, content: [{ kind: "text", text: "done", formats: [] }], children: [] },
        { checked: false, value: 2, content: [{ kind: "text", text: "todo", formats: [] }], children: [] },
      ],
    };
    const { children } = manuscriptParagraphs([beat("b1", [checks])]);

    expect(children.map((p) => textOf(p))).toEqual(["☑ done", "☐ todo"]);
  });
});

describe("manuscriptDocument", () => {
  /**
   * Packing is the only check that the whole document — custom quote style,
   * per-list numbering definitions, running header — is coherent enough for
   * Word to open. A malformed numbering reference or an undeclared style throws
   * here rather than in someone's manuscript.
   */
  it("packs a real document", async () => {
    const document = manuscriptDocument(
      manuscript([
        beat("b1", [para("one"), list(1, "a", "b")], "First"),
        beat("b2", [{ kind: "quote", align: "", indent: 0, content: [] }, para("two")], "Second"),
      ]),
    );
    const bytes = await Packer.toBuffer(document);
    // A `.docx` is a zip, and every zip starts "PK".
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });

  it("packs an empty manuscript rather than throwing", async () => {
    await expect(Packer.toBuffer(manuscriptDocument(manuscript([])))).resolves.toBeTruthy();
  });
});
