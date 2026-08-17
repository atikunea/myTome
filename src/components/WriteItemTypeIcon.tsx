import ShortTextIcon from "@mui/icons-material/ShortText";
import AutoStoriesIcon from "@mui/icons-material/AutoStories";
import NotesIcon from "@mui/icons-material/Notes";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import type { SvgIconProps } from "@mui/material";
import type { WriteItemType } from "../models/WriteItem";

const icons: Record<WriteItemType, typeof ShortTextIcon> = {
  snippet: ShortTextIcon,
  lore: AutoStoriesIcon,
  passage: NotesIcon,
  chapter: MenuBookIcon,
};

/**
 * The glyph for a write item's type. Unlike `ElementTypeIcon` there is no
 * registry or fallback to look up — the four types are a closed union, so the
 * mapping is total.
 */
export function WriteItemTypeIcon({
  type,
  ...props
}: { type: WriteItemType } & SvgIconProps) {
  const Icon = icons[type];
  return <Icon {...props} />;
}
