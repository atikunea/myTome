import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import UploadIcon from "@mui/icons-material/UploadFile";
import type { Tome, TomeStatus } from "../models/Tome";
import { imageFrom, store } from "../services/store";

export function TomeFormDialog({ open, tome }: { open: boolean; tome?: Tome }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const close = () => navigate("/tomes");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const cover = await imageFrom(
        String(data.get("coverUrl") ?? ""),
        (form.elements.namedItem("coverFile") as HTMLInputElement).files?.[0],
      );
      const saved = await store.saveTome({
        id: tome?.id,
        title: String(data.get("title") ?? ""),
        subtitle: String(data.get("subtitle") ?? ""),
        description: String(data.get("description") ?? ""),
        status: data.get("status") as TomeStatus,
        coverImage: cover ?? tome?.coverImage,
      });
      if (!tome) await store.createStarterTypes(saved.id);
      navigate(`/tomes/${saved.id}/dashboard`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save tome.");
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {tome ? "Edit tome" : "Create a tome"}
          <IconButton aria-label="Close" onClick={close} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField name="title" label="Title" required fullWidth defaultValue={tome?.title ?? ""} />
            <TextField name="subtitle" label="Subtitle" fullWidth defaultValue={tome?.subtitle ?? ""} />
            <TextField
              name="description"
              label="Description"
              fullWidth
              multiline
              minRows={3}
              defaultValue={tome?.description ?? ""}
            />
            <TextField name="status" label="Status" select fullWidth defaultValue={tome?.status ?? "Draft"}>
              <MenuItem value="Draft">Draft</MenuItem>
              <MenuItem value="Completed">Completed</MenuItem>
              <MenuItem value="Archived">Archived</MenuItem>
            </TextField>
            <TextField name="coverUrl" label="Cover image URL" placeholder="https://…" fullWidth />
            <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={{ alignSelf: "flex-start" }}>
              Upload a cover image
              <input type="file" name="coverFile" accept="image/*" hidden />
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="contained">
            Save tome
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
