import { useEffect, useState } from "react";
import { Autocomplete, Box, IconButton, Stack, TextField, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import DeleteIcon from "@mui/icons-material/Delete";
import { store } from "../services/store";
import { ElementTypeIcon } from "./ElementTypeIcon";

/**
 * One relationship, as the sentence it reads as: this element, an arrow, the
 * label, an arrow, the other element. The direction decides which end the
 * element being edited occupies, so "Dov guards Ashfell" and "Ashfell is
 * guarded by Dov" are one row seen from two sides rather than two rows.
 *
 * It was local to the old element form and moved out with that form: the
 * element page edits relationships in place, and this is the piece it reuses.
 * The label offers `store.suggestRelationshipLabels` — what this author has
 * already called a link between these two *types* — as a free-solo
 * autocomplete, so a world settles on its own vocabulary without anyone
 * enforcing one.
 */
export interface RelationshipRow {
  key: string;
  id?: string;
  direction: "from" | "to";
  otherElementId: string;
  otherElementTypeId: string;
  label: string;
}

interface TargetOption {
  id: string;
  name: string;
  elementTypeId: string;
  typeName: string;
  typeIcon?: string;
}

export function RelationshipRowEditor({
  row,
  tomeId,
  selfTypeId,
  selfLabel,
  selfIcon,
  targetOptions,
  onChange,
  onRemove,
}: {
  row: RelationshipRow;
  tomeId: string;
  selfTypeId: string;
  selfLabel: string;
  selfIcon?: string;
  targetOptions: TargetOption[];
  onChange: (row: RelationshipRow) => void;
  onRemove: () => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const target = targetOptions.find((option) => option.id === row.otherElementId) ?? null;
  const fromTypeId = row.direction === "from" ? selfTypeId : row.otherElementTypeId;
  const toTypeId = row.direction === "from" ? row.otherElementTypeId : selfTypeId;

  useEffect(() => {
    if (!row.otherElementTypeId) {
      setSuggestions([]);
      return;
    }
    let active = true;
    store.suggestRelationshipLabels(tomeId, fromTypeId, toTypeId).then((labels) => {
      if (active) setSuggestions(labels);
    });
    return () => {
      active = false;
    };
  }, [tomeId, fromTypeId, toTypeId, row.otherElementTypeId]);

  const targetPicker = (
    <Autocomplete
      options={targetOptions}
      value={target}
      getOptionLabel={(option) => `${option.name} (${option.typeName})`}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      onChange={(_, value) =>
        onChange({
          ...row,
          otherElementId: value?.id ?? "",
          otherElementTypeId: value?.elementTypeId ?? "",
        })
      }
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id}>
          <ElementTypeIcon icon={option.typeIcon} fontSize="small" sx={{ mr: 1, color: "text.secondary" }} />
          {option.name} ({option.typeName})
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Related to"
          size="small"
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: target ? (
                <ElementTypeIcon icon={target.typeIcon} fontSize="small" sx={{ ml: 0.5, color: "text.secondary" }} />
              ) : null,
            },
          }}
        />
      )}
      sx={{ flex: 1, minWidth: 200 }}
    />
  );
  const selfChip = (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 130, flexShrink: 0 }}>
      <ElementTypeIcon icon={selfIcon} fontSize="small" color="primary" />
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {selfLabel}
      </Typography>
    </Stack>
  );
  const arrow = <ArrowForwardIcon fontSize="small" color="action" sx={{ flexShrink: 0 }} />;
  const labelField = (
    <Autocomplete
      freeSolo
      options={suggestions}
      inputValue={row.label}
      onInputChange={(_, value) => onChange({ ...row, label: value })}
      renderInput={(params) => <TextField {...params} label="Relationship" size="small" />}
      sx={{ flex: 1, minWidth: 200 }}
    />
  );

  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", flexWrap: "wrap" }}>
      {row.direction === "from" ? selfChip : targetPicker}
      {arrow}
      {labelField}
      {arrow}
      {row.direction === "from" ? targetPicker : selfChip}
      <IconButton aria-label="Remove relationship" size="small" onClick={onRemove}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

