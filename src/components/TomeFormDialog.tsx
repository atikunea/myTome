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
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { ImageSource, Tome, TomeStatus } from "../models/Tome";
import { store } from "../services/store";
import { ImagePicker } from "./ImagePicker";

export function TomeFormDialog({ open, tome }: { open: boolean; tome?: Tome }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [coverImage, setCoverImage] = useState<ImageSource | undefined>(tome?.coverImage);

  const close = () => navigate("/tomes");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const saved = await store.saveTome({
        id: tome?.id,
        title: String(data.get("title") ?? ""),
        subtitle: String(data.get("subtitle") ?? ""),
        description: String(data.get("description") ?? ""),
        status: data.get("status") as TomeStatus,
        coverImage,
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
            <Stack spacing={1}>
              <Typography variant="subtitle2">Cover image</Typography>
              <ImagePicker
                image={coverImage}
                label={tome?.title || "Tome"}
                alt="Cover image"
                onChange={setCoverImage}
                sx={{ height: 160 }}
              />
            </Stack>
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
