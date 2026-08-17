import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import type { Plot } from "../models/Plot";
import type { Tome } from "../models/Tome";
import { store } from "../services/store";
import { useConfirm } from "../context/ConfirmContext";

/** Switches between a tome's plots and handles create/rename/delete for them. */
export function PlotPicker({
  tome,
  plots,
  current,
}: {
  tome: Tome;
  plots: Plot[];
  current: Plot;
}) {
  const navigate = useNavigate();
  const confirmAction = useConfirm();
  const [editing, setEditing] = useState<"new" | "rename" | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const plot = await store.savePlot({
        id: editing === "rename" ? current.id : undefined,
        tomeId: tome.id,
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
      });
      setEditing(null);
      if (editing === "new") navigate(`/tomes/${tome.id}/plots/${plot.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this plot.");
    }
  };

  const openDialog = (mode: "new" | "rename") => {
    setError("");
    setEditing(mode);
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
        <Tabs
          value={current.id}
          onChange={(_, value: string) => navigate(`/tomes/${tome.id}/plots/${value}`)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ flex: 1, minHeight: 44, "& .MuiTab-root": { minHeight: 44 } }}
        >
          {plots.map((plot) => (
            <Tab key={plot.id} value={plot.id} label={plot.name} />
          ))}
        </Tabs>
        <Tooltip title="Rename this plot">
          <IconButton size="small" aria-label="Rename this plot" onClick={() => openDialog("rename")}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete this plot">
          <IconButton
            size="small"
            aria-label="Delete this plot"
            onClick={() =>
              confirmAction(
                `Permanently delete "${current.name}" and all of its items? This cannot be undone.`,
                async () => {
                  await store.deletePlot(current);
                  navigate(`/tomes/${tome.id}/plots`, { replace: true });
                },
              )
            }
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button size="small" startIcon={<AddIcon />} onClick={() => openDialog("new")}>
          New plot
        </Button>
      </Stack>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogTitle>{editing === "rename" ? "Rename plot" : "New plot"}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2.5}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              <TextField
                name="name"
                label="Name"
                required
                fullWidth
                autoFocus
                defaultValue={editing === "rename" ? current.name : ""}
              />
              <TextField
                name="description"
                label="Description"
                fullWidth
                multiline
                minRows={2}
                defaultValue={editing === "rename" ? (current.description ?? "") : ""}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" variant="contained">
              Save plot
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}
