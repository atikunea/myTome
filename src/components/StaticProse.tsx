import { createElement, type CSSProperties, type ReactNode } from "react";
import type { Align, Block, Inline, InlineFormat, ListEntry } from "../lexical/blocks";
import { MENTION_ATTRIBUTE } from "../lexical/MentionNode";
import { proseTextTheme } from "./manuscriptStyles";

/**
 * Draws a parsed Lexical document as read-only markup, for every section of the
 * manuscript that is not the one currently being edited.
 *
 * **It reproduces Lexical's own DOM, tag for tag and class for class**, because
 * clicking a section replaces this markup with a live editor in place. Same
 * tags, same theme classes (`proseTextTheme`), same `padding-inline-start`
 * expression for indent, same `<br>` inside an empty block. Where this file
 * guesses, the page twitches on click; where it agrees, the swap is invisible
 * and the click point still resolves to the word under the cursor.
 *
 * The mapping worth testing is not here but in `lexical/blocks.ts`, which holds
 * no React and is driven from the suite's `node` environment. This component is
 * deliberately thin enough to read in one sitting.
 */

/** Lexical's `getElementOuterTag`: the format that earns a tag of its own. */
function outerTagFor(formats: Set<InlineFormat>) {
  if (formats.has("code")) return "code";
  if (formats.has("highlight")) return "mark";
  if (formats.has("subscript")) return "sub";
  if (formats.has("superscript")) return "sup";
  return null;
}

/** Lexical's `getElementInnerTag`: bold wins over italic, and both fall back to a span. */
function innerTagFor(formats: Set<InlineFormat>) {
  if (formats.has("bold")) return "strong";
  if (formats.has("italic")) return "em";
  return "span";
}

/**
 * Lexical's `setTextThemeClassNames`, including its one special case: underline
 * and strikethrough both write `text-decoration`, so a run carrying both gets a
 * single combined class instead of the two that would overwrite each other.
 */
function classNameFor(formats: Set<InlineFormat>) {
  const names: string[] = [];
  if (formats.has("underline") && formats.has("strikethrough")) {
    names.push(proseTextTheme.underlineStrikethrough);
  } else {
    if (formats.has("underline")) names.push(proseTextTheme.underline);
    if (formats.has("strikethrough")) names.push(proseTextTheme.strikethrough);
  }
  if (formats.has("bold")) names.push(proseTextTheme.bold);
  if (formats.has("italic")) names.push(proseTextTheme.italic);
  return names.length ? names.join(" ") : undefined;
}

function renderRun(
  run: Extract<Inline, { kind: "text" | "mention" }>,
  key: number,
): ReactNode {
  const formats = new Set(run.formats);
  const outerTag = outerTagFor(formats);
  const innerTag = innerTagFor(formats);
  const className = classNameFor(formats);

  const outerProps: Record<string, unknown> = { key };
  if (run.kind === "mention") outerProps[MENTION_ATTRIBUTE] = run.elementId;
  if (formats.has("code")) outerProps.spellCheck = false;

  if (outerTag)
    return createElement(
      outerTag,
      outerProps,
      createElement(innerTag, { className }, run.text),
    );
  return createElement(innerTag, { ...outerProps, className }, run.text);
}

function renderInlines(inlines: Inline[]): ReactNode {
  return inlines.map((inline, index) => {
    if (inline.kind === "break") return <br key={index} />;
    if (inline.kind === "link")
      return (
        <a key={index} href={inline.url} target="_blank" rel="noreferrer">
          {renderInlines(inline.children)}
        </a>
      );
    return renderRun(inline, index);
  });
}

/**
 * Lexical puts a `<br>` inside any block with no children, so an empty
 * paragraph keeps its line box. Without it a blank line between two paragraphs
 * collapses here and reappears the moment the section is clicked into.
 */
const renderContent = (content: Inline[]): ReactNode =>
  content.length ? renderInlines(content) : <br />;

function blockStyle(align: Align, indent: number): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (align) style.textAlign = align as CSSProperties["textAlign"];
  // Matched to Lexical's `setElementIndent` character for character, so the
  // same custom property (or its 40px default) drives both renders.
  if (indent > 0)
    style.paddingInlineStart = `calc(${indent} * var(--lexical-indent-base-value, 40px))`;
  return Object.keys(style).length ? style : undefined;
}

function renderEntry(entry: ListEntry, isCheckList: boolean, key: number) {
  return (
    <li
      key={key}
      value={entry.value}
      // A static item is not a control, so it must not claim `role="checkbox"`
      // the way the editor's does. `manuscriptStyles` matches both spellings.
      {...(isCheckList
        ? { "data-checklist": "", "data-checked": String(entry.checked ?? false) }
        : {})}
    >
      {renderContent(entry.content)}
      {entry.children.map((child, index) => renderBlock(child, index))}
    </li>
  );
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case "paragraph":
      return (
        <p key={key} style={blockStyle(block.align, block.indent)}>
          {renderContent(block.content)}
        </p>
      );
    case "heading":
      return createElement(
        block.tag,
        { key, style: blockStyle(block.align, block.indent) },
        renderContent(block.content),
      );
    case "quote":
      return (
        <blockquote key={key} style={blockStyle(block.align, block.indent)}>
          {renderContent(block.content)}
        </blockquote>
      );
    case "list": {
      const isCheckList = block.listType === "check";
      const entries = block.entries.map((entry, index) =>
        renderEntry(entry, isCheckList, index),
      );
      const style = blockStyle("", block.indent);
      // Lexical draws a check list as a `<ul>` too — the ticks are the items'
      // own affordance, not the list's.
      return block.listType === "number" ? (
        <ol key={key} start={block.start} style={style}>
          {entries}
        </ol>
      ) : (
        <ul key={key} style={style}>
          {entries}
        </ul>
      );
    }
  }
}

export function StaticProse({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((block, index) => renderBlock(block, index))}</>;
}
