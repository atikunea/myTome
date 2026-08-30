import { describe, expect, it } from "vitest";
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
import { emptyWriteItemContent } from "../../models/WriteItem";
import {
  blocksText,
  countWords,
  formatsOf,
  innerTagFor,
  lexicalToBlocks,
  outerTagFor,
  proseTextTheme,
  runClassName,
  type Block,
} from "../blocks";

/** Wraps serialized nodes in the root envelope Lexical stores them in. */
const doc = (...children: unknown[]) =>
  JSON.stringify({
    root: { type: "root", version: 1, direction: null, format: "", indent: 0, children },
  });

const text = (value: string, format = 0) => ({
  type: "text",
  text: value,
  format,
  style: "",
  mode: "normal",
  detail: 0,
  version: 1,
});

const paragraph = (...children: unknown[]) => ({
  type: "paragraph",
  version: 1,
  direction: null,
  format: "",
  indent: 0,
  children,
});

describe("lexicalToBlocks", () => {
  it("degrades to an empty document rather than throwing", () => {
    expect(lexicalToBlocks("")).toEqual([]);
    expect(lexicalToBlocks("not json")).toEqual([]);
    expect(lexicalToBlocks("null")).toEqual([]);
    expect(lexicalToBlocks("{}")).toEqual([]);
    expect(lexicalToBlocks(JSON.stringify({ root: {} }))).toEqual([]);
  });

  it("reads the empty document a new draft is created with", () => {
    expect(lexicalToBlocks(emptyWriteItemContent)).toEqual([
      { kind: "paragraph", align: "", indent: 0, content: [] },
    ]);
  });

  it("reads paragraphs, headings and quotes with their alignment and indent", () => {
    const blocks = lexicalToBlocks(
      doc(
        { ...paragraph(text("one")), format: "center", indent: 2 },
        { type: "heading", tag: "h2", version: 1, format: "", indent: 0, children: [text("two")] },
        { type: "quote", version: 1, format: "right", indent: 1, children: [text("three")] },
      ),
    );

    expect(blocks).toEqual<Block[]>([
      { kind: "paragraph", align: "center", indent: 2, content: [{ kind: "text", text: "one", formats: [] }] },
      { kind: "heading", tag: "h2", align: "", indent: 0, content: [{ kind: "text", text: "two", formats: [] }] },
      { kind: "quote", align: "right", indent: 1, content: [{ kind: "text", text: "three", formats: [] }] },
    ]);
  });

  it("falls back to sane values for an unrecognized heading tag or alignment", () => {
    const [heading] = lexicalToBlocks(
      doc({ type: "heading", tag: "h9", format: "sideways", indent: 0, children: [text("x")] }),
    );
    expect(heading).toMatchObject({ kind: "heading", tag: "h1", align: "" });
  });
});

describe("the text format bitmask", () => {
  it("maps each bit to its own format", () => {
    expect(formatsOf(IS_BOLD)).toEqual(["bold"]);
    expect(formatsOf(IS_ITALIC)).toEqual(["italic"]);
    expect(formatsOf(IS_UNDERLINE)).toEqual(["underline"]);
    expect(formatsOf(IS_STRIKETHROUGH)).toEqual(["strikethrough"]);
    expect(formatsOf(IS_CODE)).toEqual(["code"]);
    expect(formatsOf(IS_HIGHLIGHT)).toEqual(["highlight"]);
    expect(formatsOf(IS_SUBSCRIPT)).toEqual(["subscript"]);
    expect(formatsOf(IS_SUPERSCRIPT)).toEqual(["superscript"]);
  });

  it("reads several formats out of one run", () => {
    expect(formatsOf(IS_BOLD | IS_ITALIC | IS_STRIKETHROUGH)).toEqual([
      "bold",
      "italic",
      "strikethrough",
    ]);
  });

  it("treats a missing or unusable format as unformatted", () => {
    expect(formatsOf(0)).toEqual([]);
    expect(formatsOf(undefined)).toEqual([]);
    expect(formatsOf("bold")).toEqual([]);
  });

  it("carries formats through to the parsed run", () => {
    const blocks = lexicalToBlocks(doc(paragraph(text("loud", IS_BOLD | IS_UNDERLINE))));
    expect(blocks[0]).toMatchObject({
      content: [{ kind: "text", text: "loud", formats: ["bold", "underline"] }],
    });
  });
});

/**
 * The manuscript replaces a static section with a live editor in place, so the
 * two renders have to produce the same DOM for the same run. `StaticProse`
 * reimplements Lexical's rules; these pin that reimplementation, because a
 * divergence shows up as text shifting under the cursor on click rather than as
 * anything that looks like a bug in a diff.
 */
describe("run tags and classes (parity with Lexical's own DOM)", () => {
  it("gives code, highlight, sub and sup an outer tag, in Lexical's precedence", () => {
    expect(outerTagFor(["code"])).toBe("code");
    expect(outerTagFor(["highlight"])).toBe("mark");
    expect(outerTagFor(["subscript"])).toBe("sub");
    expect(outerTagFor(["superscript"])).toBe("sup");
    // Precedence matters: Lexical returns on the first match, so a run that is
    // both code and highlighted is a `<code>`, not a `<mark>`.
    expect(outerTagFor(["highlight", "code"])).toBe("code");
    expect(outerTagFor(["subscript", "highlight"])).toBe("mark");
  });

  it("gives an ordinary run no outer tag", () => {
    expect(outerTagFor([])).toBeNull();
    expect(outerTagFor(["bold", "italic", "underline"])).toBeNull();
  });

  it("picks the inner tag bold-before-italic, falling back to a span", () => {
    expect(innerTagFor(["bold"])).toBe("strong");
    expect(innerTagFor(["italic"])).toBe("em");
    expect(innerTagFor([])).toBe("span");
    expect(innerTagFor(["underline"])).toBe("span");
  });

  it("keeps italic on a bold italic run, which the tag alone cannot carry", () => {
    // The regression this exists for: Lexical gives the run ONE inner tag and
    // picks `<strong>`, so italic survives only as a class. An editor theme
    // without `italic` in it renders bold italic text upright, and a static
    // render that got it right would then disagree with the editor.
    expect(innerTagFor(["bold", "italic"])).toBe("strong");
    expect(runClassName(["bold", "italic"])).toContain(proseTextTheme.italic);
  });

  it("collapses underline + strikethrough into the one combined class", () => {
    // Both write `text-decoration`; emitting the two separate classes would let
    // one overwrite the other and silently drop a decoration.
    expect(runClassName(["underline", "strikethrough"])).toBe(
      proseTextTheme.underlineStrikethrough,
    );
    expect(runClassName(["underline"])).toBe(proseTextTheme.underline);
    expect(runClassName(["strikethrough"])).toBe(proseTextTheme.strikethrough);
  });

  it("gives an unformatted run no class at all", () => {
    expect(runClassName([])).toBeUndefined();
    // Formats that earn their own tag need no class to go with it.
    expect(runClassName(["code"])).toBeUndefined();
    expect(runClassName(["highlight", "subscript"])).toBeUndefined();
  });

  it("names every class in the theme handed to the editor", () => {
    // `initialConfig.theme.text` is this same object, so a class emitted here
    // that the editor does not know about would style only the static half.
    const emitted = new Set(
      [
        runClassName(["bold"]),
        runClassName(["italic"]),
        runClassName(["underline"]),
        runClassName(["strikethrough"]),
        runClassName(["underline", "strikethrough"]),
      ].flatMap((names) => (names ? names.split(" ") : [])),
    );
    expect([...emitted].sort()).toEqual([...new Set(Object.values(proseTextTheme))].sort());
  });
});

describe("inline content", () => {
  it("reads a mention as its own kind, keeping the element id and its formats", () => {
    const blocks = lexicalToBlocks(
      doc(
        paragraph(
          text("said "),
          { ...text("@Maren", IS_ITALIC), type: "mention", elementId: "el-1" },
        ),
      ),
    );
    expect(blocks[0]).toMatchObject({
      content: [
        { kind: "text", text: "said ", formats: [] },
        { kind: "mention", text: "@Maren", elementId: "el-1", formats: ["italic"] },
      ],
    });
  });

  it("reads links and their nested runs", () => {
    const blocks = lexicalToBlocks(
      doc(
        paragraph({
          type: "link",
          url: "https://example.com",
          version: 1,
          children: [text("there", IS_BOLD)],
        }),
      ),
    );
    expect(blocks[0]).toMatchObject({
      content: [
        {
          kind: "link",
          url: "https://example.com",
          children: [{ kind: "text", text: "there", formats: ["bold"] }],
        },
      ],
    });
  });

  it("reads a line break", () => {
    const blocks = lexicalToBlocks(
      doc(paragraph(text("one"), { type: "linebreak", version: 1 }, text("two"))),
    );
    expect(blocks[0]).toMatchObject({
      content: [
        { kind: "text", text: "one" },
        { kind: "break" },
        { kind: "text", text: "two" },
      ],
    });
  });

  it("unwraps an unknown inline wrapper rather than dropping what it holds", () => {
    const blocks = lexicalToBlocks(
      doc(paragraph({ type: "someFutureMark", version: 1, children: [text("kept")] })),
    );
    expect(blocks[0]).toMatchObject({
      content: [{ kind: "text", text: "kept", formats: [] }],
    });
  });
});

describe("lists", () => {
  const listItem = (value: number, label: string, extra: object = {}) => ({
    type: "listitem",
    value,
    version: 1,
    format: "",
    indent: 0,
    children: [text(label)],
    ...extra,
  });

  it("reads a bulleted list", () => {
    const blocks = lexicalToBlocks(
      doc({
        type: "list",
        listType: "bullet",
        tag: "ul",
        start: 1,
        version: 1,
        format: "",
        indent: 0,
        children: [listItem(1, "one"), listItem(2, "two")],
      }),
    );
    expect(blocks).toEqual<Block[]>([
      {
        kind: "list",
        listType: "bullet",
        start: 1,
        indent: 0,
        entries: [
          { value: 1, content: [{ kind: "text", text: "one", formats: [] }], children: [] },
          { value: 2, content: [{ kind: "text", text: "two", formats: [] }], children: [] },
        ],
      },
    ]);
  });

  it("keeps a numbered list's start and per-item ordinals", () => {
    const [block] = lexicalToBlocks(
      doc({
        type: "list",
        listType: "number",
        start: 5,
        children: [listItem(5, "five"), listItem(6, "six")],
      }),
    );
    expect(block).toMatchObject({
      listType: "number",
      start: 5,
      entries: [{ value: 5 }, { value: 6 }],
    });
  });

  it("carries `checked` on a check list, and only there", () => {
    const [checkList] = lexicalToBlocks(
      doc({
        type: "list",
        listType: "check",
        start: 1,
        children: [
          listItem(1, "done", { checked: true }),
          listItem(2, "todo", { checked: false }),
        ],
      }),
    );
    expect(checkList).toMatchObject({
      listType: "check",
      entries: [{ checked: true }, { checked: false }],
    });

    const [bulletList] = lexicalToBlocks(
      doc({ type: "list", listType: "bullet", start: 1, children: [listItem(1, "plain")] }),
    );
    expect(bulletList).toMatchObject({ entries: [{ value: 1 }] });
    expect((bulletList as { entries: { checked?: boolean }[] }).entries[0].checked).toBeUndefined();
  });

  it("reads a list nested inside a list item", () => {
    const [block] = lexicalToBlocks(
      doc({
        type: "list",
        listType: "bullet",
        start: 1,
        children: [
          {
            type: "listitem",
            value: 1,
            children: [
              text("outer"),
              {
                type: "list",
                listType: "bullet",
                start: 1,
                indent: 1,
                children: [listItem(1, "inner")],
              },
            ],
          },
        ],
      }),
    );

    expect(block).toMatchObject({
      entries: [
        {
          content: [{ kind: "text", text: "outer" }],
          children: [
            { kind: "list", indent: 1, entries: [{ content: [{ kind: "text", text: "inner" }] }] },
          ],
        },
      ],
    });
  });

  it("ignores a non-item child of a list, and draws a stray item as a paragraph", () => {
    const [list] = lexicalToBlocks(
      doc({ type: "list", listType: "bullet", start: 1, children: [paragraph(text("stray"))] }),
    );
    expect(list).toMatchObject({ kind: "list", entries: [] });

    const [orphan] = lexicalToBlocks(doc(listItem(1, "alone")));
    expect(orphan).toMatchObject({
      kind: "paragraph",
      content: [{ kind: "text", text: "alone" }],
    });
  });
});

describe("unknown block types", () => {
  it("unwraps a container of blocks", () => {
    const blocks = lexicalToBlocks(
      doc({ type: "layout", version: 1, children: [paragraph(text("inside"))] }),
    );
    expect(blocks).toEqual<Block[]>([
      { kind: "paragraph", align: "", indent: 0, content: [{ kind: "text", text: "inside", formats: [] }] },
    ]);
  });

  it("draws a container of inline content as a paragraph", () => {
    const blocks = lexicalToBlocks(
      doc({ type: "callout", version: 1, format: "center", indent: 1, children: [text("noted")] }),
    );
    expect(blocks).toEqual<Block[]>([
      { kind: "paragraph", align: "center", indent: 1, content: [{ kind: "text", text: "noted", formats: [] }] },
    ]);
  });

  it("drops a childless unknown node", () => {
    expect(lexicalToBlocks(doc({ type: "horizontalrule", version: 1 }))).toEqual([]);
  });
});

describe("blocksText and countWords", () => {
  it("joins blocks with newlines and flattens links and breaks", () => {
    const blocks = lexicalToBlocks(
      doc(
        paragraph(text("The rain had not stopped.")),
        {
          type: "heading",
          tag: "h2",
          children: [text("Nine miles")],
        },
        paragraph(
          text("She kept the "),
          { type: "link", url: "#", children: [text("salt tin")] },
          text(" dry."),
        ),
      ),
    );

    expect(blocksText(blocks)).toBe(
      "The rain had not stopped.\nNine miles\nShe kept the salt tin dry.",
    );
  });

  it("walks list items and their nested lists", () => {
    const blocks = lexicalToBlocks(
      doc({
        type: "list",
        listType: "bullet",
        start: 1,
        children: [
          {
            type: "listitem",
            value: 1,
            children: [
              text("outer"),
              {
                type: "list",
                listType: "bullet",
                start: 1,
                children: [
                  { type: "listitem", value: 1, children: [text("inner")] },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(blocksText(blocks)).toBe("outer\ninner");
  });

  it("counts words, ignoring surrounding and repeated whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords("  one   two\nthree ")).toBe(3);
  });
});
