import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { defaultTomeTemplateId, tomeTemplateById, tomeTemplates } from "../models/TomeTemplate";
import { defaultPlotTemplateId, noPlotTemplateId } from "../models/PlotTemplate";
import { store } from "../services/store";
import { ElementTypeIcon } from "./ElementTypeIcon";
import { ImagePicker } from "./ImagePicker";
import { PlotTemplatePicker } from "./PlotTemplatePicker";

export function TomeFormDialog({ open, tome }: { open: boolean; tome?: Tome }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [coverImage, setCoverImage] = useState<ImageSource | undefined>(tome?.coverImage);
  // Only new tomes are seeded, so the picker is create-only; editing a tome
  // never re-applies a template.
  const [templateId, setTemplateId] = useState(defaultTomeTemplateId);
  const [plotTemplateId, setPlotTemplateId] = useState(defaultPlotTemplateId);
  const template = tomeTemplateById(templateId);

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
      if (!tome) {
        await store.applyTomeTemplate(saved.id, templateId);
        // "No plot line" writes nothing at all: PlotPage's ensureDefaultPlot
        // makes a blank "Main Plot" the first time the author opens Plot.
        if (plotTemplateId !== noPlotTemplateId)
          await store.createPlotFromTemplate(saved.id, plotTemplateId);
      }
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
            {tome ? null : (
              <Stack spacing={1.25}>
                <TextField
                  select
                  label="Template"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  fullWidth
                  helperText={template.tagline}
                  slotProps={{
                    // Without this the closed field would render the whole
                    // two-line menu item — name, icon, and tagline — inside the
                    // input.
                    select: { renderValue: (value) => tomeTemplateById(String(value)).name },
                  }}
                >
                  {tomeTemplates.map((option) => (
                    <MenuItem key={option.id} value={option.id} sx={{ py: 1, alignItems: "flex-start" }}>
                      <ElementTypeIcon
                        icon={option.icon}
                        fontSize="small"
                        color="primary"
                        sx={{ mr: 1.25, mt: 0.25, flexShrink: 0 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {option.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", whiteSpace: "normal" }}
                        >
                          {option.tagline}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
                {/*
                  Everything the template will create, listed before it is
                  created — a template is only a starting point, and the author
                  can tell at a glance what they are agreeing to.
                */}
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75 }}>
                  {template.types.map((type) => (
                    <Chip
                      key={type.name}
                      size="small"
                      variant="outlined"
                      icon={<ElementTypeIcon icon={type.icon} fontSize="small" />}
                      label={type.name}
                    />
                  ))}
                </Stack>
                {/*
                  The plot structure is picked separately from the tome
                  template: the element types an author needs are a question
                  about genre, and the shape of the story is not.
                */}
                <PlotTemplatePicker value={plotTemplateId} onChange={setPlotTemplateId} />
                <Typography variant="caption" color="text.secondary">
                  A starting point — rename, edit, or delete any of it once the tome exists.
                </Typography>
              </Stack>
            )}
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
