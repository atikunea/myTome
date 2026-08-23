import { useEffect, useState, type FormEvent } from "react";
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
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { PlotDotColor, PlotDotVariant, PlotItem } from "../models/Plot";
import { plotDotColors } from "../models/Plot";
import type { WriteItem, WriteItemType } from "../models/WriteItem";
import {
  untitledWriteItem,
  writeItemTypeLabels,
  writeItemTypes,
} from "../models/WriteItem";
import { store } from "../services/store";
import { useConfirm } from "../context/ConfirmContext";
import { ElementTypeIcon, elementTypeIconOptions } from "./ElementTypeIcon";
import { WriteItemTypeIcon } from "./WriteItemTypeIcon";

const colorLabels: Record<PlotDotColor, string> = {
  grey: "Neutral",
  primary: "Primary",
  secondary: "Secondary",
  success: "Success",
  warning: "Warning",
  error: "Danger",
  info: "Info",
};

/**
 * Create/edit dialog for a plot item. `item` edits an existing row; `insertAt`
 * creates a new one at that index — the row is only written on save, so cancelling
 * leaves no empty item behind.
 */
export function PlotItemDialog({
  open,
  item,
  insertAt,
  tomeId,
  plotId,
  elements,
  types,
  writeItems,
  onOpenWriteItem,
  onClose,
}: {
  open: boolean;
  item?: PlotItem;
  insertAt?: number;
  tomeId: string;
  plotId: string;
  elements: Element[];
  types: ElementType[];
  writeItems: WriteItem[];
  onOpenWriteItem: (writeItemId: string) => void;
  onClose: () => void;
}) {
  const confirmAction = useConfirm();
  const [error, setError] = useState("");
  const [icon, setIcon] = useState<string>("");
  const [dotColor, setDotColor] = useState<PlotDotColor>("grey");
  const [dotVariant, setDotVariant] = useState<PlotDotVariant>("filled");
  const [attached, setAttached] = useState<Element[]>([]);
  const [composed, setComposed] = useState<string[]>([]);
  const [newTextMenu, setNewTextMenu] = useState<HTMLElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setIcon(item?.icon ?? "");
    setDotColor(item?.dotColor ?? "grey");
    setDotVariant(item?.dotVariant ?? "filled");
    setAttached(
      (item?.attachedElementIds ?? [])
        .map((id) => elements.find((element) => element.id === id))
        .filter((element): element is Element => Boolean(element)),
    );
    setComposed(item?.writeItemIds ?? []);
    // `elements` is intentionally excluded: re-resolving attachments on every live
    // element update would discard in-progress edits to the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const composedRows = composed
    .map((id) => writeItems.find((row) => row.id === id))
    .filter((row): row is WriteItem => Boolean(row));

  const handleComposeDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = composed.indexOf(String(active.id));
    const to = composed.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setComposed(arrayMove(composed, from, to));
  };

  /**
   * "New text" leaves this dialog for the full-page editor, so the composition
   * is persisted on the way out — otherwise reordering and then creating would
   * silently throw the reorder away. Only offered on a saved beat: a beat that
   * does not exist yet has no id to attach the new text to.
   */
  const createComposedText = async (type: WriteItemType) => {
    setNewTextMenu(null);
    if (!item) return;
    await store.setPlotItemWriteItems(item.id, composed);
    const created = await store.createDraftWriteItem(tomeId, type, item.id);
    onOpenWriteItem(created.id);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await store.savePlotItem(
        {
          id: item?.id,
          tomeId,
          plotId,
          name: String(data.get("name") ?? ""),
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          icon: icon || undefined,
          dotColor,
          dotVariant,
          attachedElementIds: attached.map((element) => element.id),
          writeItemIds: composed,
        },
        insertAt,
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this item.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>{item ? "Edit item" : "New plot item"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              name="title"
              label="Title"
              required
              fullWidth
              autoFocus
              defaultValue={item?.title ?? ""}
            />
            <TextField
              name="name"
              label="Beat label"
              fullWidth
              helperText="Shown beside the track, e.g. Chapter 1"
              defaultValue={item?.name ?? ""}
            />
            <TextField
              name="description"
              label="Description"
              fullWidth
              multiline
              minRows={3}
              defaultValue={item?.description ?? ""}
            />
            <TextField
              select
              label="Icon"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              fullWidth
            >
              <MenuItem value="">No icon</MenuItem>
              {elementTypeIconOptions.map((option) => (
                <MenuItem key={option.key} value={option.key}>
                  <option.Icon fontSize="small" sx={{ mr: 1, verticalAlign: "text-bottom" }} />
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Dot color
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                {plotDotColors.map((color) => (
                  <Tooltip key={color} title={colorLabels[color]}>
                    <Box
                      component="button"
                      type="button"
                      aria-label={colorLabels[color]}
                      aria-pressed={dotColor === color}
                      onClick={() => setDotColor(color)}
                      sx={{
                        width: 30,
                        height: 30,
                        p: 0,
                        borderRadius: "50%",
                        cursor: "pointer",
                        bgcolor: color === "grey" ? "grey.400" : `${color}.main`,
                        border: 3,
                        borderColor: dotColor === color ? "text.primary" : "transparent",
                      }}
                    />
                  </Tooltip>
                ))}
              </Stack>
            </Box>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={dotVariant}
              onChange={(_, value: PlotDotVariant | null) => value && setDotVariant(value)}
            >
              <ToggleButton value="filled">Filled</ToggleButton>
              <ToggleButton value="outlined">Outlined</ToggleButton>
            </ToggleButtonGroup>
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={[...elements].sort((a, b) =>
                a.elementTypeId.localeCompare(b.elementTypeId) || a.name.localeCompare(b.name),
              )}
              value={attached}
              onChange={(_, value) => setAttached(value)}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              groupBy={(option) =>
                types.find((t) => t.id === option.elementTypeId)?.name ?? "Other"
              }
              renderOption={(props, option) => {
                const type = types.find((t) => t.id === option.elementTypeId);
                return (
                  <Box component="li" {...props} key={option.id}>
                    <ElementTypeIcon
                      icon={type?.icon}
                      fontSize="small"
                      sx={{ mr: 1, color: "text.secondary" }}
                    />
                    {option.name}
                  </Box>
                );
              }}
              renderValue={(value, getItemProps) =>
                value.map((option, index) => {
                  const type = types.find((t) => t.id === option.elementTypeId);
                  const { key, ...itemProps } = getItemProps({ index });
                  return (
                    <Chip
                      key={key}
                      size="small"
                      variant="outlined"
                      icon={<ElementTypeIcon icon={type?.icon} fontSize="small" />}
                      label={option.name}
                      {...itemProps}
                    />
                  );
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Attached elements"
                  helperText="Elements involved in this beat — no description, just an association"
                />
              )}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Composed text
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                The writing this beat is made of, in reading order. Drag to
                restructure.
              </Typography>
              {composedRows.length ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={handleComposeDragEnd}
                >
                  <SortableContext
                    items={composedRows.map((row) => row.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <Stack spacing={0.75} sx={{ mb: 1.5 }}>
                      {composedRows.map((row) => (
                        <ComposedTextRow
                          key={row.id}
                          row={row}
                          onOpen={() => onOpenWriteItem(row.id)}
                          onRemove={() =>
                            setComposed((ids) =>
                              ids.filter((id) => id !== row.id),
                            )
                          }
                        />
                      ))}
                    </Stack>
                  </SortableContext>
                </DndContext>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Nothing composed into this beat yet.
                </Typography>
              )}
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start" }}>
                <Autocomplete
                  // Cleared after each pick: this is an "add one" control, not a
                  // second place the whole composition is edited.
                  value={null}
                  blurOnSelect
                  options={writeItems.filter(
                    (row) => !composed.includes(row.id),
                  )}
                  onChange={(_, value) =>
                    value && setComposed((ids) => [...ids, value.id])
                  }
                  getOptionLabel={(option) =>
                    option.title.trim() || untitledWriteItem
                  }
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  groupBy={(option) => writeItemTypeLabels[option.type]}
                  renderOption={(props, option) => (
                    <Box component="li" {...props} key={option.id}>
                      <WriteItemTypeIcon
                        type={option.type}
                        fontSize="small"
                        sx={{ mr: 1, color: "text.secondary" }}
                      />
                      {option.title.trim() || untitledWriteItem}
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField {...params} label="Add existing text" size="small" />
                  )}
                  sx={{ flex: 1 }}
                />
                <Tooltip
                  title={item ? "" : "Save this beat first to write new text for it"}
                >
                  <Box component="span">
                    <Button
                      size="small"
                      disabled={!item}
                      startIcon={<AddIcon />}
                      endIcon={<ArrowDropDownIcon />}
                      onClick={(event) => setNewTextMenu(event.currentTarget)}
                      sx={{ mt: 0.5 }}
                    >
                      New text
                    </Button>
                  </Box>
                </Tooltip>
                <Menu
                  anchorEl={newTextMenu}
                  open={Boolean(newTextMenu)}
                  onClose={() => setNewTextMenu(null)}
                >
                  {writeItemTypes.map((type) => (
                    <MenuItem key={type} onClick={() => createComposedText(type)}>
                      <WriteItemTypeIcon
                        type={type}
                        fontSize="small"
                        sx={{ mr: 1.25, color: "text.secondary" }}
                      />
                      {writeItemTypeLabels[type]}
                    </MenuItem>
                  ))}
                </Menu>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {item ? (
            <Button
              color="error"
              sx={{ mr: "auto" }}
              onClick={() =>
                confirmAction(`Delete "${item.title}" from this plot?`, async () => {
                  await store.deletePlotItem(item);
                  onClose();
                })
              }
            >
              Delete
            </Button>
          ) : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            Save item
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** One draggable row of a beat's composed text. */
function ComposedTextRow({
  row,
  onOpen,
  onRemove,
}: {
  row: WriteItem;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });
  const title = row.title.trim() || untitledWriteItem;

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      spacing={0.75}
      sx={{
        alignItems: "center",
        border: 1,
        borderColor: "divider",
        borderRadius: "8px",
        px: 0.75,
        py: 0.5,
        bgcolor: "background.paper",
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.65 : 1,
      }}
    >
      <Tooltip title="Drag to reorder">
        {/*
          A plain button, not IconButton — ButtonBase swallows the onKeyDown
          dnd-kit's KeyboardSensor needs to start a lift (same reason as
          TimelineCard's handle).
        */}
        <Box
          component="button"
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Reorder ${title}`}
          sx={{
            p: 0.25,
            display: "inline-flex",
            border: 0,
            borderRadius: "50%",
            bgcolor: "transparent",
            color: "text.secondary",
            cursor: "grab",
            touchAction: "none",
            "&:active": { cursor: "grabbing" },
          }}
          {...attributes}
          {...listeners}
        >
          <DragIndicatorIcon fontSize="small" />
        </Box>
      </Tooltip>
      <WriteItemTypeIcon
        type={row.type}
        fontSize="small"
        sx={{ color: "text.secondary", flexShrink: 0 }}
      />
      <Box
        component="button"
        type="button"
        onClick={onOpen}
        sx={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          border: 0,
          bgcolor: "transparent",
          font: "inherit",
          color: "text.primary",
          cursor: "pointer",
          p: 0.25,
          "&:hover": { color: "primary.main", textDecoration: "underline" },
        }}
      >
        {title}
      </Box>
      <IconButton
        size="small"
        aria-label={`Remove ${title} from this beat`}
        onClick={onRemove}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}
