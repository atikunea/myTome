import type { MouseEvent, ReactNode } from "react";
import {
  Box,
  Button,
  Card,
  Chip,
  List,
  ListItemButton,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LibraryAddOutlinedIcon from "@mui/icons-material/LibraryAddOutlined";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { Plot, PlotItem } from "../models/Plot";
import { untitledWriteItem, type WriteItem } from "../models/WriteItem";
import { monoFontFamily, threadColor } from "../theme";
import { ElementTypeIcon } from "./ElementTypeIcon";

/**
 * What a beat's manuscript knows *about* its prose, down the left of the
 * writing surface: the beat it is written for, its texts in reading order, and
 * what the tome's other plots are doing on the same row of the spine.
 *
 * That last card is the spine made visible while writing. Two beats on one row
 * are contemporaneous, so the other threads' beats are what is happening
 * elsewhere at this exact moment of the story — the thing an author otherwise
 * has to close the surface and look at the grid to remember.
 *
 * It only reads and navigates. Every change it offers — a new text, composing
 * an existing one, editing the beat — goes through a callback to the page,
 * which already owns those actions for the manuscript beside it, so the panel
 * and the prose can never disagree about what "add" means.
 */
export function BeatPanel({
  beat,
  texts,
  activeTextId,
  attachments,
  types,
  sameRow,
  rowName,
  plots,
  onJumpToText,
  onNewText,
  onComposeExisting,
  onEditBeat,
  onOpenElement,
  onOpenBeat,
}: {
  beat: PlotItem;
  /** The beat's texts, resolved and in reading order. */
  texts: WriteItem[];
  /** The section holding the live editor, marked in the outline. */
  activeTextId: string | null;
  attachments: Element[];
  types: ElementType[];
  /** Other plots' beats on this beat's spine row. */
  sameRow: PlotItem[];
  /** The row's name as the gutter shows it, or undefined while rows load. */
  rowName?: string;
  /** Every plot in the tome, in tab order — which is what picks a thread's colour. */
  plots: Plot[];
  onJumpToText: (text: WriteItem) => void;
  onNewText: (anchor: HTMLElement) => void;
  onComposeExisting: () => void;
  onEditBeat: () => void;
  onOpenElement: (element: Element) => void;
  onOpenBeat: (other: PlotItem) => void;
}) {
  const theme = useTheme();
  const colorOf = (plotId: string) =>
    threadColor(theme, plots.findIndex((plot) => plot.id === plotId));
  const plotName = (plotId: string) => plots.find((plot) => plot.id === plotId)?.name ?? "Plot";

  return (
    <Stack spacing={2}>
      <PanelCard label="The beat">
        {beat.description ? (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
            {beat.description}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.disabled">
            No description yet.
          </Typography>
        )}
        {attachments.length ? (
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
            {attachments.map((element) => {
              const type = types.find((candidate) => candidate.id === element.elementTypeId);
              return (
                <Chip
                  key={element.id}
                  size="small"
                  icon={<ElementTypeIcon icon={type?.icon} fontSize="small" />}
                  label={element.name}
                  onClick={() => onOpenElement(element)}
                />
              );
            })}
          </Stack>
        ) : null}
        <Box>
          <Button size="small" onClick={onEditBeat} sx={{ ml: -1 }}>
            Edit beat
          </Button>
        </Box>
      </PanelCard>

      <PanelCard label="Texts, in reading order">
        {texts.length ? (
          <List dense disablePadding aria-label="Texts in this beat">
            {texts.map((text, index) => (
              <ListItemButton
                key={text.id}
                selected={text.id === activeTextId}
                onClick={() => onJumpToText(text)}
                sx={{
                  borderRadius: 3,
                  gap: 1.25,
                  "&.Mui-selected": {
                    bgcolor: (t) => t.loom.brassSoft,
                    color: "primary.main",
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{ fontFamily: monoFontFamily, fontSize: "0.7rem", color: "text.secondary", width: 14 }}
                >
                  {index + 1}
                </Box>
                <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                  {text.title.trim() || untitledWriteItem}
                </Typography>
                <Box
                  component="span"
                  sx={{ fontFamily: monoFontFamily, fontSize: "0.7rem", color: "text.secondary" }}
                >
                  {text.wordCount.toLocaleString()}
                </Box>
              </ListItemButton>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.disabled">
            No texts yet.
          </Typography>
        )}
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={(event: MouseEvent<HTMLElement>) => onNewText(event.currentTarget)}
          >
            New text
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<LibraryAddOutlinedIcon />}
            onClick={onComposeExisting}
          >
            Compose existing
          </Button>
        </Stack>
      </PanelCard>

      {sameRow.length ? (
        <PanelCard label={rowName ? `Also on ${rowName}` : "Same row, other threads"}>
          <Stack spacing={0.5}>
            {sameRow.map((other) => (
              <Box
                key={other.id}
                component="button"
                type="button"
                onClick={() => onOpenBeat(other)}
                aria-label={`Write ${other.title}, on ${plotName(other.plotId)}`}
                sx={{
                  display: "flex",
                  gap: 1.25,
                  alignItems: "stretch",
                  p: 1,
                  mx: -1,
                  border: 0,
                  borderRadius: 3,
                  bgcolor: "transparent",
                  color: "inherit",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                  "&:hover, &:focus-visible": { bgcolor: "action.hover" },
                }}
              >
                <Box
                  aria-hidden
                  sx={{ width: 3, flexShrink: 0, borderRadius: 2, bgcolor: colorOf(other.plotId) }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {plotName(other.plotId)}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
                    {other.title}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </PanelCard>
      ) : null}
    </Stack>
  );
}

function PanelCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        {label}
      </Typography>
      {children}
    </Card>
  );
}
