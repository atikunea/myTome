import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Tome } from "../models/Tome";
import { store, validateTomeTargets } from "../services/store";

/**
 * A book's own two targets: how long it is meant to be, and when it is due.
 *
 * They live on the tome rather than with the daily goal because they *are* the
 * book — a length and a date belong to one manuscript the way a title does,
 * while a daily habit belongs to the writer. Both are optional and clearing
 * either is a real answer, which is why the fields submit empty rather than
 * refusing to.
 *
 * Nothing derived is stored here. Required pace and projected finish are
 * computed on every read from these two and the book's current total; a stored
 * pace would be wrong the moment the next word was typed.
 */
export function TomeTargetsDialog({ tome, onClose }: { tome: Tome; onClose: () => void }) {
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawTarget = String(data.get("wordTarget") ?? "").trim();
    const rawDeadline = String(data.get("deadline") ?? "").trim();
    const patch = {
      wordTarget: rawTarget ? Number(rawTarget) : undefined,
      deadline: rawDeadline || undefined,
    };
    try {
      validateTomeTargets(patch);
      await store.updateTome(tome.id, patch);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save those targets.");
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Targets for this book</DialogTitle>
        <DialogContent>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              name="wordTarget"
              label="Word target"
              type="number"
              defaultValue={tome.wordTarget ?? ""}
              slotProps={{ htmlInput: { min: 0 } }}
              helperText="How long this book is meant to be. Leave empty for no target."
              fullWidth
              autoFocus
            />
            <TextField
              name="deadline"
              label="Deadline"
              type="date"
              defaultValue={tome.deadline ?? ""}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="The day it is due. With a target, this is what the pace is worked out from."
              fullWidth
            />
            <Typography variant="body2" color="text.secondary">
              Your daily word goal is set once for the whole library, on the
              activity page — one habit, one streak, whichever book you are in.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained">
            Save targets
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
