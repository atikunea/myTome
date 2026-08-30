import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import type { BackupSummary, MergeAction, RestoreMode } from "../services/store";

/**
 * What restoring a chosen file would do, and which way to do it.
 *
 * This is the one dialog in the app that is **not** URL-addressable, and the
 * exception is deliberate: every other create/edit dialog is a route because its
 * state can be rebuilt from the URL, and this one's state is a file the author
 * picked out of their filesystem, which no route can name. Reloading on
 * `#/backup?restoring=…` could only reopen an empty dialog.
 */
export function RestoreDialog({
  summary,
  fileName,
  pending,
  error,
  onCancel,
  onRestore,
}: {
  summary: BackupSummary;
  fileName: string;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onRestore: (mode: RestoreMode) => void;
}) {
  const [mode, setMode] = useState<RestoreMode>("merge");
  const made = summary.exportedAt ? new Date(summary.exportedAt) : undefined;
  const overwriting = summary.tomes.filter(
    (tome) => tome.mergeAction === "replace",
  ).length;
  const stale = summary.tomes.filter((tome) => tome.mergeAction === "keep").length;

  return (
    <Dialog open onClose={pending ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Restore from backup</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Typography color="text.secondary" sx={{ mb: 0.5 }}>
          {fileName}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2.5 }}>
          {count(summary.tomes.length, "tome")}
          {made && !Number.isNaN(made.valueOf())
            ? `, backed up ${made.toLocaleString()}`
            : ""}
        </Typography>

        <Stack spacing={1.25} sx={{ mb: 2.5 }}>
          {summary.tomes.map((tome) => (
            <Box
              key={tome.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1.5,
                p: 1.5,
                border: 1,
                borderColor: "divider",
                borderRadius: "10px",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                  {tome.title || "Untitled"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {count(tome.elements, "element")} · {count(tome.plots, "plot")} ·{" "}
                  {count(tome.writeItems, "text")}
                </Typography>
              </Box>
              <MergeChip action={tome.mergeAction} mode={mode} />
            </Box>
          ))}
        </Stack>

        <RadioGroup
          value={mode}
          onChange={(e) => setMode(e.target.value as RestoreMode)}
        >
          <FormControlLabel
            value="merge"
            control={<Radio />}
            label={
              <Box sx={{ py: 0.5 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  Merge — keep whichever copy is newer
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Tomes you already have are only overwritten when the file holds
                  newer work. Nothing else in this browser is touched.
                </Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="replace"
            control={<Radio />}
            label={
              <Box sx={{ py: 0.5 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  Replace everything in this browser
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Deletes every tome here first, then loads the file exactly as it
                  was backed up.
                </Typography>
              </Box>
            }
          />
        </RadioGroup>

        {mode === "merge" && stale ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            {count(stale, "tome")} in this file {stale === 1 ? "holds" : "hold"} no
            newer work than the copy here, so {stale === 1 ? "it" : "they"} will be
            left alone. Choose Replace if you meant to roll back to the backup.
          </Alert>
        ) : null}
        {mode === "merge" && overwriting ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {overwriting === 1
              ? "1 tome here will be overwritten"
              : `${overwriting} tomes here will be overwritten`}{" "}
            by the newer copy in this file.
          </Alert>
        ) : null}
        {mode === "replace" ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Everything currently in this browser is deleted, including tomes this
            file does not contain.
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" loading={pending} onClick={() => onRestore(mode)}>
          Restore
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "1 plot", "3 plots" — the counts here are small and often exactly one. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

const mergeLabels: Record<MergeAction, string> = {
  add: "New here",
  replace: "Newer in file",
  // Covers "the same as what's here" as well as "older", which is why it says
  // what a merge would do rather than which copy won.
  keep: "Nothing newer",
};

const mergeColors: Record<MergeAction, "success" | "warning" | "default"> = {
  add: "success",
  replace: "warning",
  keep: "default",
};

/** In replace mode every tome comes in regardless, so the merge verdict is moot. */
function MergeChip({ action, mode }: { action: MergeAction; mode: RestoreMode }) {
  if (mode === "replace")
    return <Chip size="small" label="Restored" color="success" />;
  return (
    <Chip size="small" label={mergeLabels[action]} color={mergeColors[action]} />
  );
}
