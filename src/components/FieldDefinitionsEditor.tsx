import { useState } from "react";
import {
  Box,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import type { FieldDefinition, FieldKind } from "../models/ElementType";

export function FieldDefinitionsEditor({
  fields,
  onChange,
  onRemove,
}: {
  fields: FieldDefinition[];
  onChange: (fields: FieldDefinition[]) => void;
  onRemove: (id: string) => void;
}) {
  const update = (id: string, patch: Partial<FieldDefinition>) => {
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  };

  const addField = () => {
    onChange([
      ...fields,
      { id: crypto.randomUUID(), name: "", kind: "text", options: [], required: false, sortOrder: fields.length },
    ]);
  };

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h3" sx={{ fontSize: "1.15rem" }}>
          Custom fields
        </Typography>
        <IconButton aria-label="Add field" size="small" onClick={addField}>
          <AddIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Stack divider={<Divider />}>
        {fields.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            onUpdate={(patch) => update(field.id, patch)}
            onRemove={() => onRemove(field.id)}
          />
        ))}
      </Stack>
      {!fields.length ? (
        <Typography color="text.secondary" sx={{ py: 1.75 }}>
          No custom fields yet.
        </Typography>
      ) : null}
      {fields.length ? (
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
          For configurable lists, enter choices separated by commas.
        </Typography>
      ) : null}
    </Box>
  );
}

function FieldRow({
  field,
  onUpdate,
  onRemove,
}: {
  field: FieldDefinition;
  onUpdate: (patch: Partial<FieldDefinition>) => void;
  onRemove: () => void;
}) {
  // Kept separate from `field.options` so the box always shows exactly what was
  // typed. Deriving the value from the parsed array (trimmed/split/rejoined on
  // every keystroke) would erase commas and trailing spaces as soon as they're typed.
  const [optionsText, setOptionsText] = useState(() => (field.options ?? []).join(", "));

  const handleOptionsChange = (text: string) => {
    setOptionsText(text);
    onUpdate({
      options: text
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
  };

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.25}
      sx={{ alignItems: { xs: "stretch", sm: "center" }, py: 1.5 }}
    >
      <TextField
        placeholder="Field name"
        value={field.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        size="small"
        sx={{ flex: "1 1 180px" }}
      />
      <TextField
        select
        value={field.kind}
        onChange={(e) => onUpdate({ kind: e.target.value as FieldKind })}
        size="small"
        sx={{ flex: "0 1 170px" }}
      >
        <MenuItem value="text">Text</MenuItem>
        <MenuItem value="select">List</MenuItem>
      </TextField>
      {field.kind === "select" ? (
        <TextField
          placeholder="Choices, separated by commas"
          value={optionsText}
          onChange={(e) => handleOptionsChange(e.target.value)}
          size="small"
          sx={{ flex: "1 1 220px" }}
        />
      ) : null}
      <FormControlLabel
        control={<Checkbox checked={field.required} onChange={(e) => onUpdate({ required: e.target.checked })} />}
        label="Required"
        sx={{ flex: "0 0 auto", whiteSpace: "nowrap", mx: 0 }}
      />
      <IconButton aria-label="Remove field" title="Remove field" color="error" onClick={onRemove}>
        <DeleteOutlineIcon />
      </IconButton>
    </Stack>
  );
}
