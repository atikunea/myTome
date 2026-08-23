import { Box, Chip, ListSubheader, MenuItem, Stack, TextField, Typography } from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";
import {
  noPlotTemplateId,
  plotTemplateById,
  plotTemplateCategories,
  plotTemplates,
} from "../models/PlotTemplate";
import { ElementTypeIcon } from "./ElementTypeIcon";

/**
 * The story-structure picker shared by the two places a plot line is born: the
 * create-tome dialog and the "New plot" dialog. It is a controlled select plus a
 * preview of what the chosen structure will write, so the author can see what
 * they are agreeing to before the beats exist.
 *
 * `noPlotTemplateId` is a real option, not an empty value — an author who wants
 * to outline from scratch picks it deliberately.
 */
export function PlotTemplatePicker({
  value,
  onChange,
  label = "Plot template",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const template = plotTemplateById(value);
  // The beat labels, deduped but left in beat order — "Act I, Act II, Act III"
  // says more about the shape of a structure than the beat count alone.
  const beatLabels = [...new Set(template?.beats.map((beat) => beat.name) ?? [])];

  return (
    <Stack spacing={1.25}>
      <TextField
        select
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        fullWidth
        helperText={template?.tagline ?? "Start empty and outline the beats yourself."}
        slotProps={{
          // Without this the closed field would render the whole two-line menu
          // item — name, icon, and tagline — inside the input.
          select: {
            renderValue: (selected) => plotTemplateById(String(selected))?.name ?? "No plot line",
          },
        }}
      >
        <MenuItem value={noPlotTemplateId} sx={{ py: 1, alignItems: "flex-start" }}>
          <EditNoteIcon fontSize="small" color="primary" sx={{ mr: 1.25, mt: 0.25, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              No plot line
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", whiteSpace: "normal" }}
            >
              Start empty and outline the beats yourself.
            </Typography>
          </Box>
        </MenuItem>
        {/*
          Flattened rather than nested: MUI's Select reads its children directly,
          so a wrapping element around each group would break option lookup.
        */}
        {plotTemplateCategories.flatMap((category) => [
          <ListSubheader key={category}>{category}</ListSubheader>,
          ...plotTemplates
            .filter((option) => option.category === category)
            .map((option) => (
              <MenuItem key={option.id} value={option.id} sx={{ py: 1, alignItems: "flex-start" }}>
                <ElementTypeIcon
                  icon={option.icon}
                  fontSize="small"
                  color="primary"
                  sx={{ mr: 1.25, mt: 0.25, flexShrink: 0 }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {option.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", whiteSpace: "normal" }}
                  >
                    {option.tagline}
                  </Typography>
                </Box>
              </MenuItem>
            )),
        ])}
      </TextField>
      {template ? (
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={`${template.beats.length} beats`}
          />
          {beatLabels.map((name) => (
            <Chip key={name} size="small" variant="outlined" label={name} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
