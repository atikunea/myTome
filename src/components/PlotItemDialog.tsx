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
  Stack,
  TextField,
} from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { PlotDotColor, PlotDotVariant, PlotItem } from "../models/Plot";
import { store } from "../services/store";
import { useConfirm } from "../context/ConfirmContext";
import { ElementTypeIcon } from "./ElementTypeIcon";
import { DotStyleControls } from "./DotStyleControls";


/**
 * Create/edit dialog for a plot item: what the beat *is* and how it is drawn.
 * `item` edits an existing row; without one it creates, on `plotRowId` if the
 * route named a cell and at the end of the plot otherwise. Either way the row is
 * only written on save, so cancelling leaves no empty item behind.
 *
 * **The beat label is deliberately not here either.** `item.name` is typed on
 * the card, where it is read, so this dialog carries the stored value through a
 * save without offering to edit it — see `handleSubmit`. Two fields writing one
 * value is how they drift.
 *
 * **Composition is deliberately not here.** The beat's `writeItemIds` — the
 * prose it is made of, in reading order — are edited in the beat's manuscript
 * instead, beside the text they order. That is why this dialog is short again,
 * and why the old "save the composition on the way out" defence is gone: there
 * is no longer a navigation out of an unsaved list to defend against.
 * `savePlotItem` falls back to the stored `writeItemIds` when a caller omits
 * them, so saving from here leaves the composition untouched.
 */
export function PlotItemDialog({
  open,
  item,
  plotRowId,
  tomeId,
  plotId,
  elements,
  types,
  thread,
  onOpenManuscript,
  onClose,
}: {
  open: boolean;
  item?: PlotItem;
  /** Places a new beat on a specific spine row — the grid creates in a cell. */
  plotRowId?: string;
  tomeId: string;
  plotId: string;
  elements: Element[];
  types: ElementType[];
  /** The plot's thread colour, which the "Thread" swatch is drawn in. */
  thread: string;
  /** Opens the beat's manuscript. Absent for a beat that does not exist yet. */
  onOpenManuscript?: (item: PlotItem) => void;
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
          // Not a field here any more — the label is typed on the card. It still
          // has to be *carried*, because `savePlotItem` takes `name` as required
          // and writes what it is given: omitting it, or passing "", would clear
          // the label every time anything else about the beat was saved.
          name: item?.name ?? "",
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          icon: icon || undefined,
          dotColor,
          dotVariant,
          attachedElementIds: attached.map((element) => element.id),
          plotRowId,
        },
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
              name="description"
              label="Description"
              fullWidth
              multiline
              minRows={3}
              defaultValue={item?.description ?? ""}
            />
            <DotStyleControls
              dotColor={dotColor}
              dotVariant={dotVariant}
              icon={icon}
              thread={thread}
              onChange={(patch) => {
                if (patch.dotColor) setDotColor(patch.dotColor);
                if (patch.dotVariant) setDotVariant(patch.dotVariant);
                if (patch.icon !== undefined) setIcon(patch.icon);
              }}
            />
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
          {item && onOpenManuscript ? (
            <Button startIcon={<EditNoteIcon />} onClick={() => onOpenManuscript(item)}>
              Write
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
