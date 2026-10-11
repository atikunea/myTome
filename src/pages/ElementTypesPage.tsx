import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  IconButton,
  Paper,
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
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import type { ElementType, FieldDefinition } from "../models/ElementType";
import { store } from "../services/store";
import { useTomeWorkspace } from "../context/TomeWorkspaceContext";
import { useConfirm } from "../context/ConfirmContext";
import { FieldDefinitionsEditor } from "../components/FieldDefinitionsEditor";
import { ElementTypeIcon, elementTypeIconOptions } from "../components/ElementTypeIcon";

export function ElementTypesPage({ creating = false }: { creating?: boolean }) {
  const { configId } = useParams<{ configId?: string }>();
  const { tome, types } = useTomeWorkspace();
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [icon, setIcon] = useState<string | undefined>(undefined);

  const editing = configId ? types.find((type) => type.id === configId) : undefined;

  useEffect(() => {
    setFields(editing?.fieldDefinitions ?? []);
    setIcon(editing?.icon);
    setError("");
    // Reset only when navigating to a different editor instance, not on every live data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId, creating]);

  if (!tome) return null;
  const goTo = (path = "") => navigate(`/tomes/${tome.id}/elements/settings${path}`);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await store.saveType({
        id: editing?.id,
        tomeId: tome.id,
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        icon,
        fieldDefinitions: fields,
      });
      goTo();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save element type.");
    }
  };

  const handleFieldRemove = async (id: string) => {
    const persisted = editing?.fieldDefinitions.find((definition) => definition.id === id);
    if (!editing || !persisted) {
      setFields((prev) => prev.filter((field) => field.id !== id));
      return;
    }
    const count = await store.countField(editing.id, id);
    confirmAction(
      `Remove "${persisted.name}"? ${count} stored value${count === 1 ? "" : "s"} will be permanently deleted.`,
      async () => {
        await store.deleteField(editing, id);
        setFields((prev) => prev.filter((field) => field.id !== id));
      },
    );
  };

  if (creating || editing) {
    return (
      <Card variant="outlined" sx={{ maxWidth: 750 }}>
        <CardContent sx={{ p: 3.25 }}>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 3 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <ElementTypeIcon icon={icon} color="primary" />
                <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
                  {editing ? `Configure ${editing.name}` : "New element type"}
                </Typography>
              </Stack>
              <IconButton aria-label="Cancel" size="small" onClick={() => goTo()}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Stack spacing={2.5}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              <TextField name="name" label="Name" required fullWidth defaultValue={editing?.name ?? ""} />
              <TextField
                name="description"
                label="Description"
                fullWidth
                multiline
                minRows={2}
                defaultValue={editing?.description ?? ""}
              />
              <Stack spacing={1}>
                <Typography variant="subtitle2">Icon</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  <IconButton
                    aria-label="No icon"
                    title="No icon"
                    onClick={() => setIcon(undefined)}
                    sx={{
                      border: 1,
                      borderColor: icon === undefined ? "primary.main" : "divider",
                      bgcolor: icon === undefined ? "action.selected" : "transparent",
                    }}
                  >
                    <ElementTypeIcon fontSize="small" />
                  </IconButton>
                  {elementTypeIconOptions.map(({ key, label, Icon }) => (
                    <IconButton
                      key={key}
                      aria-label={label}
                      title={label}
                      onClick={() => setIcon(key)}
                      sx={{
                        border: 1,
                        borderColor: icon === key ? "primary.main" : "divider",
                        bgcolor: icon === key ? "action.selected" : "transparent",
                      }}
                    >
                      <Icon fontSize="small" />
                    </IconButton>
                  ))}
                </Box>
              </Stack>
              <FieldDefinitionsEditor fields={fields} onChange={setFields} onRemove={handleFieldRemove} />
            </Stack>
            <Stack direction="row" sx={{ justifyContent: "flex-end", mt: 3 }}>
              <Button type="submit" variant="contained">
                Save type
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "center", mb: 3.25 }}>
        <Box>
          <Typography variant="overline" color="primary" sx={{ fontWeight: 800, letterSpacing: "0.12em" }}>
            ELEMENT CONFIGURATION
          </Typography>
          <Typography variant="h2" sx={{ fontSize: "1.7rem" }}>
            Element types
          </Typography>
          <Typography color="text.secondary">
            Define the building blocks for this tome. Drag a type by its handle to change its
            place in the side menu.
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} onClick={() => goTo("/new")} sx={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>
          New type
        </Button>
      </Stack>
      <ElementTypeList
        tomeId={tome.id}
        types={types}
        onConfigure={(type) => goTo(`/${type.id}`)}
        onDelete={async (type) => {
          const count = await store.countElements(type.id);
          confirmAction(
            `Permanently delete "${type.name}" and all ${count} of its elements? This cannot be undone.`,
            async () => {
              await store.deleteType(type);
              goTo();
            },
          );
        }}
      />
    </Box>
  );
}

/**
 * The tome's types as one column, in the order the side menu shows them, so
 * that dragging a row here is visibly the same act as moving it there. A
 * wrapping grid would read left-to-right and hide that.
 *
 * Saved on drop, like the plot tabs: the rendered order is held locally and
 * re-seeded only when the stored set changes, so the live query's echo of this
 * page's own write does not snap the row back for a frame.
 */
function ElementTypeList({
  tomeId,
  types,
  onConfigure,
  onDelete,
}: {
  tomeId: string;
  types: ElementType[];
  onConfigure: (type: ElementType) => void;
  onDelete: (type: ElementType) => void;
}) {
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const storedKey = types.map((type) => type.id).join("|");
  useEffect(() => {
    setOrderedIds((currentIds) => {
      const stored = storedKey ? storedKey.split("|") : [];
      const sameSet =
        currentIds.length === stored.length && currentIds.every((id) => stored.includes(id));
      return sameSet ? currentIds : stored;
    });
  }, [storedKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);
  const ordered = orderedIds
    .map((id) => byId.get(id))
    .filter((type): type is ElementType => Boolean(type));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = orderedIds.indexOf(String(active.id));
    const to = orderedIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(orderedIds, from, to);
    setOrderedIds(next);
    store.reorderTypes(tomeId, next);
  };

  if (!ordered.length) {
    return <Typography color="text.secondary">No element types yet.</Typography>;
  }

  return (
    <Paper variant="outlined" sx={{ maxWidth: 900 }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <Stack divider={<Divider />}>
            {ordered.map((type) => (
              <ElementTypeRow
                key={type.id}
                type={type}
                onConfigure={() => onConfigure(type)}
                onDelete={() => onDelete(type)}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>
    </Paper>
  );
}

function ElementTypeRow({
  type,
  onConfigure,
  onDelete,
}: {
  type: ElementType;
  onConfigure: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: type.id });
  const fieldCount = type.fieldDefinitions.length;

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      spacing={1.25}
      sx={{
        alignItems: "center",
        px: { xs: 1, sm: 1.5 },
        py: 1.25,
        transform: CSS.Translate.toString(transform),
        transition,
        // The lifted row passes over its neighbours, so it needs their paper.
        zIndex: isDragging ? 1 : undefined,
        position: isDragging ? "relative" : undefined,
        bgcolor: isDragging ? "background.paper" : undefined,
        boxShadow: isDragging ? 3 : undefined,
      }}
    >
      {/*
        A plain button with a native title, not IconButton inside a Tooltip:
        ButtonBase swallows the keys dnd-kit's KeyboardSensor needs, and Tooltip
        clones its child and costs the handle its activator ref.
      */}
      <Box
        component="button"
        type="button"
        ref={setActivatorNodeRef}
        title="Drag to reorder"
        aria-label={`Reorder ${type.name}`}
        sx={{
          flex: "0 0 auto",
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
      <ElementTypeIcon icon={type.icon} color="primary" fontSize="small" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h3" sx={{ fontSize: "1.05rem" }} noWrap>
          {type.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {type.description || "No description"}
        </Typography>
      </Box>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ flex: "0 0 auto", display: { xs: "none", sm: "block" }, whiteSpace: "nowrap" }}
      >
        {fieldCount} custom field{fieldCount === 1 ? "" : "s"}
      </Typography>
      <Stack direction="row" sx={{ flex: "0 0 auto" }}>
        <Tooltip title={`Configure ${type.name}`}>
          <IconButton aria-label={`Configure ${type.name}`} size="small" onClick={onConfigure}>
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={`Delete ${type.name}`}>
          <IconButton aria-label={`Delete ${type.name}`} size="small" color="error" onClick={onDelete}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
