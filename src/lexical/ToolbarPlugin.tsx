import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Divider,
  MenuItem,
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
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { $setBlocksType } from "@lexical/selection";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@lexical/rich-text";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from "@lexical/list";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
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
  | "strikethrough"
  | "bulletList"
  | "numberedList"
  | "quote";

/**
 * The toolbar's contents: an array of groups, each a list of items, rendered
 * left to right with a divider between groups. Pass a different shape to
 * `ToolbarPlugin` to add, drop, or regroup controls — this constant is only the
 * default, and is the single place the standard set is described.
 */
export const defaultToolbarItems: ToolbarItem[][] = [
  ["undo", "redo"],
  ["blockType"],
  ["bold", "italic", "underline", "strikethrough"],
  ["bulletList", "numberedList", "quote"],
];

/** The block shape the caret currently sits in, as the block picker reports it. */
type BlockType = "paragraph" | "h1" | "h2" | "h3" | "quote" | "bullet" | "number";

const blockLabels: { value: BlockType; label: string }[] = [
  { value: "paragraph", label: "Normal text" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "quote", label: "Quote" },
];

/** Inline formats, which are all the same `FORMAT_TEXT_COMMAND` call. */
const inlineFormats: Partial<
  Record<
    ToolbarItem,
    { format: TextFormatType; label: string; Icon: typeof FormatBoldIcon }
  >
> = {
  bold: { format: "bold", label: "Bold", Icon: FormatBoldIcon },
  italic: { format: "italic", label: "Italic", Icon: FormatItalicIcon },
  underline: { format: "underline", label: "Underline", Icon: FormatUnderlinedIcon },
  strikethrough: {
    format: "strikethrough",
    label: "Strikethrough",
    Icon: StrikethroughSIcon,
  },
};

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
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncToolbar = useCallback(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const active = new Set<TextFormatType>();
    for (const format of ["bold", "italic", "underline", "strikethrough"] as const)
      if (selection.hasFormat(format)) active.add(format);
    setFormats(active);

    // A list item's top-level element is the list itself, and a heading's is the
    // heading — so one lookup answers the block question for every case.
    const anchor = selection.anchor.getNode();
    const element = $isRootOrShadowRoot(anchor)
      ? anchor
      : anchor.getTopLevelElement();
    if (!element) return setBlockType("paragraph");
    if ($isListNode(element))
      return setBlockType(element.getListType() === "number" ? "number" : "bullet");
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
    if (next === "bullet")
      return editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    if (next === "number")
      return editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    // Leaving a list needs the list structure torn down first; `$setBlocksType`
    // alone would leave the new block orphaned inside the list.
    if (blockType === "bullet" || blockType === "number")
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () =>
        next === "quote"
          ? $createQuoteNode()
          : next === "paragraph"
            ? $createParagraphNode()
            : $createHeadingNode(next),
      );
    });
  };

  const toggleList = (item: "bulletList" | "numberedList") => {
    const target = item === "bulletList" ? "bullet" : "number";
    if (blockType === target)
      return editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    editor.dispatchCommand(
      item === "bulletList"
        ? INSERT_UNORDERED_LIST_COMMAND
        : INSERT_ORDERED_LIST_COMMAND,
      undefined,
    );
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
      case "bulletList":
      case "numberedList": {
        const isBullet = item === "bulletList";
        return (
          <ToolButton
            key={item}
            label={isBullet ? "Bulleted list" : "Numbered list"}
            selected={blockType === (isBullet ? "bullet" : "number")}
            onActivate={() => toggleList(item)}
          >
            {isBullet ? (
              <FormatListBulletedIcon fontSize="small" />
            ) : (
              <FormatListNumberedIcon fontSize="small" />
            )}
          </ToolButton>
        );
      }
      case "quote":
        return (
          <ToolButton
            key={item}
            label="Quote"
            selected={blockType === "quote"}
            onActivate={() => applyBlockType(blockType === "quote" ? "paragraph" : "quote")}
          >
            <FormatQuoteIcon fontSize="small" />
          </ToolButton>
        );
      default:
        return null;
    }
  };

  return (
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
  onActivate: () => void;
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
