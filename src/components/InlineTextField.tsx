import { useEffect, useRef, useState } from "react";
import { InputBase, type SxProps, type Theme } from "@mui/material";
import type { SaveState } from "../hooks/autosave";
import { useAutosave } from "../hooks/useAutosave";

/**
 * A line of text on the element page, edited where it sits.
 *
 * Unlike `ProseField` this does **not** swap a static render for a live one. A
 * one-line value has no caret to resolve against a click point, so the swap
 * would buy nothing and cost the thing that makes it safe there — two renders
 * that occupy identical space. Instead the input is always live and simply
 * looks like text until it is hovered or focused, which is also one fewer click
 * between the author and the word they came to change.
 *
 * It owns an autosave machine of its own, on the same debounce the prose fields
 * use, and **flushes on blur** so a pending write lands as focus leaves rather
 * than trailing the author to the next field.
 */
export function InlineTextField({
  value,
  placeholder,
  multiline = false,
  ariaLabel,
  sx,
  save,
  onSaveState,
  onFocus,
}: {
  value: string;
  placeholder: string;
  multiline?: boolean;
  ariaLabel: string;
  sx?: SxProps<Theme>;
  save: (value: string) => Promise<void>;
  onSaveState: (state: SaveState, retry: () => void) => void;
  /**
   * Focus arrived here. The element page uses it to stand a prose field down —
   * a click already does that by bubbling, but tabbing into this one does not.
   */
  onFocus?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);

  const { state, autosave } = useAutosave(async () => {
    await save(latest.current);
  });

  useEffect(() => {
    onSaveState(state, autosave.saveNow);
  }, [state, autosave, onSaveState]);

  // Follow the row when it changes underneath us — a restore, another tab, an
  // edit made elsewhere on the page — but never while an edit of our own is
  // waiting, or the author's half-typed word would be replaced by the echo of
  // what they typed a moment ago.
  useEffect(() => {
    if (autosave.isDirty()) return;
    latest.current = value;
    setDraft(value);
  }, [value, autosave]);

  useEffect(() => {
    return () => {
      void autosave.flush();
    };
  }, [autosave]);

  return (
    <InputBase
      value={draft}
      placeholder={placeholder}
      multiline={multiline}
      inputProps={{ "aria-label": ariaLabel }}
      onChange={(event) => {
        setDraft(event.target.value);
        latest.current = event.target.value;
        autosave.schedule();
      }}
      onFocus={onFocus}
      onBlur={() => {
        if (autosave.isDirty()) void autosave.saveNow();
      }}
      onKeyDown={(event) => {
        // Enter commits rather than inserting a line: a field that wanted line
        // breaks would be a `prose` field.
        if (event.key === "Enter" && !multiline) {
          event.preventDefault();
          (event.target as HTMLElement).blur();
        }
      }}
      sx={{
        // The padding is the hover target and does not change with state, so
        // nothing moves as the author tabs along a column of fields.
        px: 1,
        mx: -1,
        py: 0.25,
        borderRadius: 1,
        width: "100%",
        font: "inherit",
        color: "inherit",
        transition: (theme) => theme.transitions.create("background-color"),
        "&:hover": { bgcolor: "action.hover" },
        "&.Mui-focused": { bgcolor: "action.selected" },
        "& input, & textarea": { p: 0, font: "inherit" },
        ...sx,
      }}
    />
  );
}
