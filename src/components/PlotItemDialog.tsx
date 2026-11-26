import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { PlotDotColor, PlotDotVariant } from "../models/Plot";
import { store } from "../services/store";
import { ElementAttachPicker } from "./ElementAttachPicker";
import { DotStyleControls } from "./DotStyleControls";

/**
 * The form a new beat is created with: what it *is* and how it is drawn. It
 * creates on `plotRowId` if the route named a cell, and at the end of the plot
 * otherwise. The row is only written on save, so cancelling leaves no empty
 * beat behind.
 *
 * **It only creates.** An existing beat is edited on its card — label, title,
 * description, dot and attachments each through a narrow setter — so a second
 * place editing the same values would only be a way for them to drift. The old
 * `items/:itemId` edit link now lands on the grid instead (`PlotPage`).
 *
 * No beat label (it is typed on the card, where it is read) and no
 * composition: a beat's `writeItemIds` are edited in its manuscript, beside the
 * text they order.
 */
export function PlotItemDialog({
  open,
  plotRowId,
  tomeId,
  plotId,
  elements,
  types,
  thread,
  onClose,
}: {
  open: boolean;
  /** Places the new beat on a specific spine row — the grid creates in a cell. */
  plotRowId?: string;
  tomeId: string;
  plotId: string;
  elements: Element[];
  types: ElementType[];
  /** The plot's thread colour, which the "Thread" swatch is drawn in. */
  thread: string;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [icon, setIcon] = useState<string>("");
  const [dotColor, setDotColor] = useState<PlotDotColor>("grey");
  const [dotVariant, setDotVariant] = useState<PlotDotVariant>("filled");
  const [attached, setAttached] = useState<Element[]>([]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setIcon("");
    setDotColor("grey");
    setDotVariant("filled");
    setAttached([]);
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await store.savePlotItem({
        tomeId,
        plotId,
        name: "",
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? ""),
        icon: icon || undefined,
        dotColor,
        dotVariant,
        attachedElementIds: attached.map((element) => element.id),
        plotRowId,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this item.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>New plot item</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField name="title" label="Title" required fullWidth autoFocus defaultValue="" />
            <TextField
              name="description"
              label="Description"
              fullWidth
              multiline
              minRows={3}
              defaultValue=""
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
            <ElementAttachPicker
              elements={elements}
              types={types}
              value={attached}
              onChange={setAttached}
              label="Attached elements"
              helperText="Elements involved in this beat — no description, just an association"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            Save item
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
