import { Fragment, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $insertNodes, type TextNode } from "lexical";
import { ListSubheader, MenuItem, MenuList, Paper } from "@mui/material";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import { ElementTypeIcon } from "../components/ElementTypeIcon";
import { $createMentionNode } from "./MentionNode";

/** Suggestions shown at once — enough to choose from without a wall of names. */
const MAX_SUGGESTIONS = 12;

class ElementOption extends MenuOption {
  element: Element;
  type?: ElementType;

  constructor(element: Element, type?: ElementType) {
    super(element.id);
    this.element = element;
    this.type = type;
  }
}

/**
 * Typing `@` plus letters opens a picker over the tome's elements; choosing one
 * inserts an inline `MentionNode`. Options are grouped by element type, matching
 * how `PlotItemDialog`'s attachment picker presents the same list.
 */
export function MentionsPlugin({
  elements,
  types,
}: {
  elements: Element[];
  types: ElementType[];
}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);

  // minLength 0 so the menu opens on a bare `@` and narrows as letters arrive.
  const triggerFn = useBasicTypeaheadTriggerMatch("@", { minLength: 0 });

  const options = useMemo(() => {
    const needle = (query ?? "").toLowerCase();
    const typeById = new Map(types.map((type) => [type.id, type]));
    return elements
      .filter((element) => element.name.toLowerCase().includes(needle))
      .sort(
        (a, b) =>
          (typeById.get(a.elementTypeId)?.sortOrder ?? 0) -
            (typeById.get(b.elementTypeId)?.sortOrder ?? 0) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, MAX_SUGGESTIONS)
      .map(
        (element) =>
          new ElementOption(element, typeById.get(element.elementTypeId)),
      );
  }, [query, elements, types]);

  const onSelectOption = useCallback(
    (
      option: ElementOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        const mention = $createMentionNode(
          option.element.id,
          option.element.name,
        );
        if (nodeToReplace) nodeToReplace.replace(mention);
        else $insertNodes([mention]);
        mention.select();
      });
      closeMenu();
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<ElementOption>
      options={options}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
        anchorElementRef.current && options.length
          ? createPortal(
              <Paper
                elevation={8}
                sx={{ mt: 0.5, minWidth: 230, maxHeight: 300, overflowY: "auto" }}
              >
                <MenuList dense>
                  {options.map((option, index) => (
                    <Fragment key={option.key}>
                      {option.type?.id !== options[index - 1]?.type?.id ? (
                        <ListSubheader sx={{ lineHeight: "28px" }}>
                          {option.type?.name ?? "Other"}
                        </ListSubheader>
                      ) : null}
                      <MenuItem
                        ref={(element) => option.setRefElement(element)}
                        selected={index === selectedIndex}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => {
                          setHighlightedIndex(index);
                          selectOptionAndCleanUp(option);
                        }}
                      >
                        <ElementTypeIcon
                          icon={option.type?.icon}
                          fontSize="small"
                          sx={{ mr: 1.25, color: "text.secondary" }}
                        />
                        {option.element.name}
                      </MenuItem>
                    </Fragment>
                  ))}
                </MenuList>
              </Paper>,
              anchorElementRef.current,
            )
          : null
      }
    />
  );
}
