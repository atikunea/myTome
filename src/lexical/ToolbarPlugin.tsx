import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
} from "@mui/material";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import CodeIcon from "@mui/icons-material/Code";
import HighlightIcon from "@mui/icons-material/Highlight";
import SubscriptIcon from "@mui/icons-material/Subscript";
import SuperscriptIcon from "@mui/icons-material/Superscript";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import LinkIcon from "@mui/icons-material/Link";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import ChecklistIcon from "@mui/icons-material/Checklist";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import FormatIndentIncreaseIcon from "@mui/icons-material/FormatIndentIncrease";
import FormatIndentDecreaseIcon from "@mui/icons-material/FormatIndentDecrease";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import { $forEachSelectedTextNode, $setBlocksType } from "@lexical/selection";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@lexical/rich-text";
import {
  $createLinkNode,
  $isLinkNode,
  $toggleLink,
  formatUrl,
} from "@lexical/link";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from "@lexical/list";
import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type BaseSelection,
  type ElementFormatType,
  type ElementNode,
  type LexicalCommand,
  type TextFormatType,
} from "lexical";

/** Every control the toolbar knows how to render. */
export type ToolbarItem =
  | "undo"
  | "redo"
  | "blockType"
  | "bold"
  | "italic"
  | "underline"
  | "formatMenu"
  | "clearFormatting"
  | "link"
  | "listMenu"
  | "alignMenu"
  | "outdent"
  | "indent";

/**
 * The toolbar's contents: an array of groups, each a list of items, rendered
 * left to right with a divider between groups. Pass a different shape to
 * `ToolbarPlugin` to add, drop, or regroup controls — this constant is only the
 * default, and is the single place the standard set is described.
 */
export const defaultToolbarItems: ToolbarItem[][] = [
  ["undo", "redo"],
  ["blockType"],
  ["bold", "italic", "underline", "formatMenu", "clearFormatting"],
  ["link", "listMenu"],
  ["alignMenu", "outdent", "indent"],
];

/** The block shape the caret currently sits in, as the block picker reports it. */
type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "bullet"
  | "number"
  | "check";

const blockLabels: { value: BlockType; label: string }[] = [
  { value: "paragraph", label: "Normal text" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "quote", label: "Quote" },
];

/** Inline formats, which are all the same `FORMAT_TEXT_COMMAND` call. */
type InlineFormat = {
  format: TextFormatType;
  label: string;
  Icon: typeof FormatBoldIcon;
};

/** The inline formats that earn a toolbar button of their own. */
const inlineFormats: Partial<Record<ToolbarItem, InlineFormat>> = {
  bold: { format: "bold", label: "Bold", Icon: FormatBoldIcon },
  italic: { format: "italic", label: "Italic", Icon: FormatItalicIcon },
  underline: { format: "underline", label: "Underline", Icon: FormatUnderlinedIcon },
};

/**
 * The rarer inline formats, behind one dropdown. Unlike the list and alignment
 * menus these are not mutually exclusive — struck-through superscript is a
 * legitimate thing to ask for — so the button reports the first one active and
 * the menu ticks every one that is.
 */
const formatMenuChoices: InlineFormat[] = [
  {
    format: "strikethrough",
    label: "Strikethrough",
    Icon: StrikethroughSIcon,
  },
  { format: "highlight", label: "Highlight", Icon: HighlightIcon },
  { format: "code", label: "Inline code", Icon: CodeIcon },
  { format: "subscript", label: "Subscript", Icon: SubscriptIcon },
  { format: "superscript", label: "Superscript", Icon: SuperscriptIcon },
];

/** Every format the toolbar reflects back, wherever its control lives. */
const trackedFormats = [
  ...Object.values(inlineFormats),
  ...formatMenuChoices,
].map((entry) => entry.format);

/**
 * Lists, which differ only in the command that turns them on. Shown as one
 * dropdown rather than three buttons — only one can be active at a time, so the
 * other two never say anything the first does not.
 */
const listChoices: {
  type: BlockType;
  command: LexicalCommand<void>;
  label: string;
  Icon: typeof FormatBoldIcon;
}[] = [
  {
    type: "bullet",
    command: INSERT_UNORDERED_LIST_COMMAND,
    label: "Bulleted list",
    Icon: FormatListBulletedIcon,
  },
  {
    type: "number",
    command: INSERT_ORDERED_LIST_COMMAND,
    label: "Numbered list",
    Icon: FormatListNumberedIcon,
  },
  {
    type: "check",
    command: INSERT_CHECK_LIST_COMMAND,
    label: "Check list",
    Icon: ChecklistIcon,
  },
];

const listBlockTypes = listChoices.map((entry) => entry.type);

/** Block alignment, which is all the same `FORMAT_ELEMENT_COMMAND` call. */
const alignChoices: {
  format: ElementFormatType;
  label: string;
  Icon: typeof FormatBoldIcon;
}[] = [
  { format: "left", label: "Align left", Icon: FormatAlignLeftIcon },
  { format: "center", label: "Align centre", Icon: FormatAlignCenterIcon },
  { format: "right", label: "Align right", Icon: FormatAlignRightIcon },
  { format: "justify", label: "Justify", Icon: FormatAlignJustifyIcon },
];

/**
 * Formatting controls for the Write editor, reflecting the caret's current
 * state. Mount inside a `LexicalComposer`.
 */
export function ToolbarPlugin({
  items = defaultToolbarItems,
}: {
  items?: ToolbarItem[][];
}) {
  const [editor] = useLexicalComposerContext();
  const [formats, setFormats] = useState<Set<TextFormatType>>(new Set());
  const [blockType, setBlockType] = useState<BlockType>("paragraph");
  const [alignment, setAlignment] = useState<ElementFormatType>("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // The URL of the link under the caret, or null when the caret is not in one.
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [linkAnchor, setLinkAnchor] = useState<HTMLElement | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  // The caret as it stood when the link popover opened. The popover's text
  // field takes focus and the editor's selection goes with it, so the range the
  // link should apply to has to be held here until Apply is pressed.
  const savedSelection = useRef<BaseSelection | null>(null);
  const linkInput = useRef<HTMLInputElement | null>(null);

  const syncToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const active = new Set<TextFormatType>();
    for (const format of trackedFormats)
      if (selection.hasFormat(format)) active.add(format);
    setFormats(active);

    const anchor = selection.anchor.getNode();

    const link = $findMatchingParent(anchor, $isLinkNode);
    setLinkTarget($isLinkNode(link) ? link.getURL() : null);

    // Alignment is read from the nearest block ancestor rather than the top
    // level one, because that is exactly what `FORMAT_ELEMENT_COMMAND` writes
    // to — inside a list it is the list item, not the list.
    const block = $findMatchingParent(
      anchor,
      (node): node is ElementNode => $isElementNode(node) && !node.isInline(),
    );
    setAlignment(block ? block.getFormatType() : "");

    // A list item's top-level element is the list itself, and a heading's is the
    // heading — so one lookup answers the block question for every case.
    const element = $isRootOrShadowRoot(anchor)
      ? anchor
      : anchor.getTopLevelElement();
    if (!element) return setBlockType("paragraph");
    if ($isListNode(element)) return setBlockType(element.getListType());
    if ($isHeadingNode(element)) {
      const tag = element.getTag();
      return setBlockType(
        tag === "h1" || tag === "h2" || tag === "h3" ? tag : "paragraph",
      );
    }
    if ($isQuoteNode(element)) return setBlockType("quote");
    setBlockType("paragraph");
  }, []);

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) =>
          editorState.read(syncToolbar),
        ),
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            syncToolbar();
            return false;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
        editor.registerCommand(
          CAN_UNDO_COMMAND,
          (payload) => {
            setCanUndo(payload);
            return false;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
        editor.registerCommand(
          CAN_REDO_COMMAND,
          (payload) => {
            setCanRedo(payload);
            return false;
          },
          COMMAND_PRIORITY_CRITICAL,
        ),
      ),
    [editor, syncToolbar],
  );

  const applyBlockType = (next: BlockType) => {
    if (next === blockType) return;
    const list = listChoices.find((entry) => entry.type === next);
    if (list) return editor.dispatchCommand(list.command, undefined);
    // Leaving a list needs the list structure torn down first; `$setBlocksType`
    // alone would leave the new block orphaned inside the list.
    if (listBlockTypes.includes(blockType))
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () =>
        next === "quote"
          ? $createQuoteNode()
          : next === "h1" || next === "h2" || next === "h3"
            ? $createHeadingNode(next)
            : $createParagraphNode(),
      );
    });
  };

  const toggleList = (list: (typeof listChoices)[number]) => {
    if (blockType === list.type)
      return editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.dispatchCommand(list.command, undefined);
  };

  /** Drops every inline format and inline style from the selected text. */
  const clearFormatting = () =>
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $forEachSelectedTextNode((node) => {
        node.setFormat(0);
        node.setStyle("");
      });
      // A collapsed caret has no text nodes to walk; clearing the format the
      // selection carries stops the next keystroke re-applying what was there.
      selection.setFormat(0);
      selection.setStyle("");
    });

  const openLinkEditor = (event: React.MouseEvent<HTMLElement>) => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      savedSelection.current = selection ? selection.clone() : null;
    });
    setLinkDraft(linkTarget ?? "");
    setLinkAnchor(event.currentTarget);
  };

  const closeLinkEditor = () => {
    setLinkAnchor(null);
    savedSelection.current = null;
    editor.focus();
  };

  const applyLink = () => {
    const url = linkDraft.trim();
    if (!url) return;
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      const selection = $getSelection();
      // With nothing selected and no link to re-point, there is no text to
      // carry the link, so the URL goes in as its own linked text.
      if ($isRangeSelection(selection) && selection.isCollapsed() && !linkTarget) {
        const link = $createLinkNode(formatUrl(url));
        link.append($createTextNode(url));
        return selection.insertNodes([link]);
      }
      $toggleLink(formatUrl(url));
    });
    closeLinkEditor();
  };

  const removeLink = () => {
    editor.update(() => {
      if (savedSelection.current) $setSelection(savedSelection.current.clone());
      $toggleLink(null);
    });
    closeLinkEditor();
  };

  const renderItem = (item: ToolbarItem) => {
    const inline = inlineFormats[item];
    if (inline)
      return (
        <ToolButton
          key={item}
          label={inline.label}
          selected={formats.has(inline.format)}
          onActivate={() =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, inline.format)
          }
        >
          <inline.Icon fontSize="small" />
        </ToolButton>
      );

    switch (item) {
      case "listMenu":
        return (
          <ToolMenu
            key={item}
            label="Lists"
            choices={listChoices.map((list) => ({
              key: list.type,
              label: list.label,
              Icon: list.Icon,
              active: blockType === list.type,
              onSelect: () => toggleList(list),
            }))}
          />
        );
      case "alignMenu":
        return (
          <ToolMenu
            key={item}
            label="Alignment"
            choices={alignChoices.map((align) => ({
              key: align.format || "none",
              label: align.label,
              Icon: align.Icon,
              active: alignment === align.format,
              // Choosing the active alignment clears it rather than doing
              // nothing, so there is a way back to the inherited default.
              onSelect: () =>
                editor.dispatchCommand(
                  FORMAT_ELEMENT_COMMAND,
                  alignment === align.format ? "" : align.format,
                ),
            }))}
          />
        );
      case "formatMenu":
        return (
          <ToolMenu
            key={item}
            label="More formats"
            choices={formatMenuChoices.map((entry) => ({
              key: entry.format,
              label: entry.label,
              Icon: entry.Icon,
              active: formats.has(entry.format),
              onSelect: () =>
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, entry.format),
            }))}
          />
        );
      case "undo":
      case "redo": {
        const isUndo = item === "undo";
        return (
          <ToolButton
            key={item}
            label={isUndo ? "Undo" : "Redo"}
            disabled={isUndo ? !canUndo : !canRedo}
            onActivate={() =>
              editor.dispatchCommand(isUndo ? UNDO_COMMAND : REDO_COMMAND, undefined)
            }
          >
            {isUndo ? <UndoIcon fontSize="small" /> : <RedoIcon fontSize="small" />}
          </ToolButton>
        );
      }
      case "blockType":
        return (
          <TextField
            key={item}
            select
            size="small"
            aria-label="Block type"
            value={blockLabels.some((b) => b.value === blockType) ? blockType : "paragraph"}
            onChange={(event) => applyBlockType(event.target.value as BlockType)}
            sx={{ minWidth: 145, "& .MuiInputBase-input": { py: 0.65 } }}
          >
            {blockLabels.map((block) => (
              <MenuItem key={block.value} value={block.value}>
                {block.label}
              </MenuItem>
            ))}
          </TextField>
        );
      case "clearFormatting":
        return (
          <ToolButton key={item} label="Clear formatting" onActivate={clearFormatting}>
            <FormatClearIcon fontSize="small" />
          </ToolButton>
        );
      case "link":
        return (
          <ToolButton
            key={item}
            label={linkTarget === null ? "Insert link" : "Edit link"}
            selected={linkTarget !== null}
            onActivate={openLinkEditor}
          >
            <LinkIcon fontSize="small" />
          </ToolButton>
        );
      case "indent":
      case "outdent": {
        const isIndent = item === "indent";
        return (
          <ToolButton
            key={item}
            label={isIndent ? "Increase indent" : "Decrease indent"}
            onActivate={() =>
              editor.dispatchCommand(
                isIndent ? INDENT_CONTENT_COMMAND : OUTDENT_CONTENT_COMMAND,
                undefined,
              )
            }
          >
            {isIndent ? (
              <FormatIndentIncreaseIcon fontSize="small" />
            ) : (
              <FormatIndentDecreaseIcon fontSize="small" />
            )}
          </ToolButton>
        );
      }
      default:
        return null;
    }
  };

  return (
    <>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          gap: 0.5,
          py: 1,
          mb: 1,
          borderBottom: 1,
          borderColor: "divider",
          // Keeps the controls reachable in a long chapter without scrolling back.
          position: "sticky",
          top: 0,
          zIndex: 2,
          bgcolor: "background.default",
        }}
      >
        {items
          .map((group) => group.map(renderItem).filter(Boolean))
          .filter((group) => group.length)
          .map((group, index) => (
            <Stack
              // Groups are positional and have no identity of their own; the items
              // inside them carry the keys that matter.
              key={index}
              direction="row"
              spacing={0.5}
              sx={{ alignItems: "center" }}
            >
              {index ? (
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.25 }} />
              ) : null}
              {group}
            </Stack>
          ))}
      </Stack>

      <Popover
        open={Boolean(linkAnchor)}
        anchorEl={linkAnchor}
        onClose={closeLinkEditor}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        // The field cannot claim focus with `autoFocus`: the popover's focus
        // trap moves focus to the paper once it has opened, which would undo it.
        // Focusing after the transition settles is the only order that sticks.
        slotProps={{
          transition: { onEntered: () => linkInput.current?.select() },
        }}
      >
        <Stack direction="row" spacing={1} sx={{ p: 1.5, alignItems: "center" }}>
          <TextField
            inputRef={linkInput}
            size="small"
            label="Link URL"
            placeholder="example.com"
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              applyLink();
            }}
            sx={{ minWidth: 280 }}
          />
          <Button size="small" onClick={applyLink} disabled={!linkDraft.trim()}>
            Apply
          </Button>
          {linkTarget !== null ? (
            <Button size="small" color="error" onClick={removeLink}>
              Remove
            </Button>
          ) : null}
        </Stack>
      </Popover>
    </>
  );
}

/**
 * One button standing in for a set of related controls: it shows the active
 * choice, or the first as a placeholder when none is, and opens the rest on
 * click. Costs one slot of toolbar width instead of one per choice.
 *
 * Choices need not be mutually exclusive. Where several can be on at once the
 * menu ticks each of them and the button falls back to reporting the first,
 * since a single button has only one icon to give.
 */
function ToolMenu({
  label,
  choices,
}: {
  label: string;
  choices: {
    key: string;
    label: string;
    Icon: typeof FormatBoldIcon;
    active: boolean;
    onSelect: () => void;
  }[];
}) {
  const [editor] = useLexicalComposerContext();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const active = choices.find((choice) => choice.active);
  const { Icon } = active ?? choices[0];

  return (
    <>
      <ToolButton
        label={label}
        selected={Boolean(active)}
        onActivate={(event) => setAnchor(event.currentTarget)}
      >
        <Icon fontSize="small" />
        <ArrowDropDownIcon fontSize="small" sx={{ ml: -0.25, mr: -0.75 }} />
      </ToolButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        {choices.map((choice) => (
          <MenuItem
            key={choice.key}
            selected={choice.active}
            dense
            onClick={() => {
              setAnchor(null);
              choice.onSelect();
              // The menu took focus on open; the command applies to the stored
              // selection either way, but the caret has to come back so typing
              // continues where it left off.
              editor.focus();
            }}
          >
            <ListItemIcon>
              <choice.Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{choice.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/**
 * A toolbar button that never steals the caret. Without suppressing mousedown
 * the editor loses its selection the instant the button is pressed, and the
 * command then applies to nothing.
 */
function ToolButton({
  label,
  selected = false,
  disabled = false,
  onActivate,
  children,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onActivate: (event: React.MouseEvent<HTMLElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <Box component="span">
        <ToggleButton
          value={label}
          size="small"
          selected={selected}
          disabled={disabled}
          aria-label={label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onActivate}
          sx={{ border: 0, borderRadius: "6px", p: 0.75 }}
        >
          {children}
        </ToggleButton>
      </Box>
    </Tooltip>
  );
}
