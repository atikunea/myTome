import {
  $applyNodeReplacement,
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
} from "lexical";

export type SerializedMentionNode = Spread<
  { elementId: string },
  SerializedTextNode
>;

/**
 * Attribute carried by a mention's DOM node. The editor page styles mentions and
 * routes their clicks off this rather than a class name, so the look stays in
 * MUI `sx` (theme-aware, both color modes) instead of a stylesheet — `createDOM`
 * runs outside React and has no access to the MUI theme.
 */
export const MENTION_ATTRIBUTE = "data-mytome-mention";

/**
 * An inline reference to an Element, rendered as `@Name`.
 *
 * The element's name is denormalized into the node's own text: a document is
 * stored as serialized Lexical JSON, so resolving names at render time would
 * mean loading every referenced element before any text could be shown. The
 * cost is that a renamed element keeps its old name in already-written prose,
 * and a deleted one leaves an inert mention — mentions are deliberately not
 * cascade-maintained.
 */
export class MentionNode extends TextNode {
  __elementId: string;

  static getType(): string {
    return "mention";
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__elementId, node.__text, node.__key);
  }

  constructor(elementId: string, text: string, key?: NodeKey) {
    super(text, key);
    this.__elementId = elementId;
  }

  getElementId(): string {
    return this.getLatest().__elementId;
  }

  setElementId(elementId: string): this {
    const self = this.getWritable();
    self.__elementId = elementId;
    return self;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute(MENTION_ATTRIBUTE, this.__elementId);
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config);
    if (prevNode.__elementId !== this.__elementId)
      dom.setAttribute(MENTION_ATTRIBUTE, this.__elementId);
    return updated;
  }

  static importJSON(serializedNode: SerializedMentionNode): MentionNode {
    return $createMentionNode("", "").updateFromJSON(serializedNode);
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedMentionNode>,
  ): this {
    return super.updateFromJSON(serializedNode).setElementId(
      serializedNode.elementId,
    );
  }

  exportJSON(): SerializedMentionNode {
    return { ...super.exportJSON(), elementId: this.__elementId };
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

export function $createMentionNode(
  elementId: string,
  name: string,
): MentionNode {
  const node = new MentionNode(elementId, `@${name}`);
  // Token mode makes the mention atomic: it selects and deletes as one unit
  // rather than letting the caret land inside and split the name apart.
  node.setMode("token");
  return $applyNodeReplacement(node);
}

export function $isMentionNode(
  node: LexicalNode | null | undefined,
): node is MentionNode {
  return node instanceof MentionNode;
}
