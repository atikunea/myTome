import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { WritingGoals } from "../models/Activity";
import { weekdayLabels } from "../models/Activity";
import { store, validateWritingGoals } from "../services/store";

/**
 * The library's writing goals — the daily target, the days it applies to, and
 * what counts as a full sitting.
 *
 * **There is one of these for the whole shelf, not one per book.** A streak
 * that broke every time the author moved to their other manuscript would punish
 * exactly the wrong thing; the habit is the writer's, and only the length and
 * the deadline belong to a particular book.
 *
 * The counted days are a `ToggleButtonGroup` rather than seven checkboxes
 * because the answer is nearly always one of two shapes — every day, or the
 * working week — and both should be one glance to read back.
 */
export function WritingGoalsDialog({
  goals,
  onClose,
}: {
  goals: WritingGoals;
  onClose: () => void;
}) {
  const [days, setDays] = useState<number[]>(goals.countedDays);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const number = (name: string) => {
      const raw = String(data.get(name) ?? "").trim();
      return raw ? Number(raw) : 0;
    };
    const patch = {
      dailyWords: number("dailyWords"),
      countedDays: [...days].sort((a, b) => a - b),
      sessionWords: number("sessionWords") || undefined,
      sessionMinutes: number("sessionMinutes") || undefined,
    };
    try {
      validateWritingGoals(patch);
      await store.saveWritingGoals(patch);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save those goals.");
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Writing goals</DialogTitle>
        <DialogContent>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              name="dailyWords"
              label="Daily word goal"
              type="number"
              defaultValue={goals.dailyWords || ""}
              slotProps={{ htmlInput: { min: 0 } }}
              helperText="Words a day, across every book. Leave empty for no daily goal."
              fullWidth
              autoFocus
            />
            <Stack spacing={1}>
              <FormLabel sx={{ fontSize: "0.8rem" }}>Days it applies to</FormLabel>
              <ToggleButtonGroup
                value={days}
                onChange={(_event, next: number[]) => setDays(next)}
                size="small"
                fullWidth
                aria-label="Days the daily goal applies to"
              >
                {weekdayLabels.map((label, index) => (
                  <ToggleButton key={label} value={index} aria-label={label}>
                    {label.slice(0, 1)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary">
                A day you leave off never breaks a streak — and words written on
                it still count towards the book.
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                name="sessionWords"
                label="Words a sitting"
                type="number"
                defaultValue={goals.sessionWords ?? ""}
                slotProps={{ htmlInput: { min: 0 } }}
                fullWidth
              />
              <TextField
                name="sessionMinutes"
                label="Minutes a sitting"
                type="number"
                defaultValue={goals.sessionMinutes ?? ""}
                slotProps={{ htmlInput: { min: 0 } }}
                fullWidth
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              A sitting opens when you start writing and closes after ten
              minutes away from the keyboard. Whether it met its target is shown
              in the day's log afterwards.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained">
            Save goals
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
