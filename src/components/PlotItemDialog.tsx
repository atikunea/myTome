import { useEffect, useState, type FormEvent } from "react";
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
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { PlotDotColor, PlotDotVariant, PlotItem } from "../models/Plot";
import { plotDotColors } from "../models/Plot";
import { store } from "../services/store";
import { useConfirm } from "../context/ConfirmContext";
import { ElementTypeIcon, elementTypeIconOptions } from "./ElementTypeIcon";

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
  onClose,
}: {
  open: boolean;
  item?: PlotItem;
  insertAt?: number;
  tomeId: string;
  plotId: string;
  elements: Element[];
  types: ElementType[];
  onClose: () => void;
}) {
  const confirmAction = useConfirm();
  const [error, setError] = useState("");
  const [icon, setIcon] = useState<string>("");
  const [dotColor, setDotColor] = useState<PlotDotColor>("grey");
  const [dotVariant, setDotVariant] = useState<PlotDotVariant>("filled");
  const [attached, setAttached] = useState<Element[]>([]);

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
    // `elements` is intentionally excluded: re-resolving attachments on every live
    // element update would discard in-progress edits to the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

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
              label="Spine label"
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
