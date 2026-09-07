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
  Tooltip,
  Typography,
} from "@mui/material";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import type { FieldDefinition, FieldKind } from "../models/ElementType";

/**
 * The custom fields of one element type, reorderable by drag.
 *
 * Order is the array's order and nothing else: `saveType` renumbers every
 * `sortOrder` from the array index it is handed, so a drag is a plain
 * `arrayMove` on the parent's draft list and lands in the database with the
 * rest of the form. Nothing is written until the type is saved.
 */
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = fields.map((field) => field.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(fields, from, to));
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
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
        </SortableContext>
      </DndContext>
      {!fields.length ? (
        <Typography color="text.secondary" sx={{ py: 1.75 }}>
          No custom fields yet.
        </Typography>
      ) : null}
      {fields.length ? (
        <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
          For configurable lists, enter choices separated by commas. A prose
          field is a block of formatted writing on the element's page — give a
          type as many as it needs. Drag a field by its handle to change the
          order it appears in on an element.
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

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });

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
      ref={setNodeRef}
      direction={{ xs: "column", sm: "row" }}
      spacing={1.25}
      sx={{
        alignItems: { xs: "stretch", sm: "center" },
        py: 1.5,
        transform: CSS.Translate.toString(transform),
        transition,
        // A lifted row must clear the rows it passes, which are opaque form controls.
        zIndex: isDragging ? 1 : undefined,
        position: isDragging ? "relative" : undefined,
        bgcolor: isDragging ? "background.paper" : undefined,
        opacity: isDragging ? 0.65 : 1,
      }}
    >
      <Tooltip title="Drag to reorder">
        {/*
          A plain button, not MUI's IconButton: ButtonBase routes key events
          through its own `getButtonProps` wrapper, which swallows the
          `onKeyDown` that dnd-kit's KeyboardSensor needs to start a lift.
        */}
        <Box
          component="button"
          type="button"
          ref={setActivatorNodeRef}
          aria-label={field.name ? `Reorder ${field.name}` : "Reorder field"}
          sx={{
            flex: "0 0 auto",
            alignSelf: { xs: "flex-start", sm: "center" },
            p: 0.5,
            display: "inline-flex",
            border: 0,
            borderRadius: "50%",
            bgcolor: "transparent",
            color: "text.secondary",
            cursor: "grab",
            touchAction: "none",
            "&:hover": { bgcolor: "action.hover" },
            "&:active": { cursor: "grabbing" },
          }}
          {...attributes}
          {...listeners}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      </Tooltip>
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
        <MenuItem value="prose">Prose</MenuItem>
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
