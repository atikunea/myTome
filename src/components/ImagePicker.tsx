import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import UploadIcon from "@mui/icons-material/UploadFile";
import type { ImageSource } from "../models/Tome";
import { imageFrom } from "../services/store";
import { useImageSrc, useObjectUrl } from "../hooks/useObjectUrl";
import { CoverThumbnail } from "./CoverThumbnail";

export function ImagePicker({
  image,
  label,
  alt,
  onChange,
  sx,
}: {
  image?: ImageSource;
  label: string;
  alt: string;
  onChange: (image: ImageSource | undefined) => void;
  sx?: SxProps<Theme>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ButtonBase
        onClick={() => setOpen(true)}
        aria-label={image ? `Change ${alt}` : `Add ${alt}`}
        sx={{
          position: "relative",
          display: "block",
          width: "100%",
          overflow: "hidden",
          borderRadius: 1,
          "&:hover .image-picker-overlay, &:focus-visible .image-picker-overlay": { opacity: 1 },
          ...sx,
        }}
      >
        <CoverThumbnail image={image} label={label} alt={alt} sx={{ width: "100%", height: "100%" }} />
        <Stack
          className="image-picker-overlay"
          direction="row"
          spacing={0.75}
          sx={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(0, 0, 0, 0.55)",
            color: "#fff",
            opacity: 0,
            transition: "opacity 0.15s",
          }}
        >
          <EditIcon fontSize="small" />
          <Typography variant="body2">{image ? "Change image" : "Add image"}</Typography>
        </Stack>
      </ButtonBase>
      <ImagePickerDialog
        open={open}
        image={image}
        alt={alt}
        onClose={() => setOpen(false)}
        onChange={onChange}
      />
    </>
  );
}

function ImagePickerDialog({
  open,
  image,
  alt,
  onClose,
  onChange,
}: {
  open: boolean;
  image?: ImageSource;
  alt: string;
  onClose: () => void;
  onChange: (image: ImageSource | undefined) => void;
}) {
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<File>();
  const [typed, setTyped] = useState("");

  // Opening *and* closing start the dialog over. MUI unmounts the content but
  // not this component, so what the last visit picked would otherwise still be
  // sitting here — holding its object URL open while nothing is showing it.
  useEffect(() => {
    setError("");
    setPicked(undefined);
    setTyped("");
  }, [open]);

  // What Save would use, shown. The precedence is `imageFrom`'s own: a file the
  // author just browsed for beats a URL left in the box, which beats the image
  // already on the record. Both hooks run every render; only the pick changes.
  const pickedUrl = useObjectUrl(picked);
  const storedUrl = useImageSrc(image);
  const preview = pickedUrl ?? (typed || storedUrl);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPicked(event.target.files?.[0]);
  };

  const handleUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTyped(event.target.value.trim());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const next = await imageFrom(
        String(data.get("url") ?? ""),
        (form.elements.namedItem("file") as HTMLInputElement).files?.[0],
      );
      onChange(next ?? image);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not use that image.");
    }
  };

  const handleRemove = () => {
    onChange(undefined);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {image ? "Change image" : "Add image"}
          <IconButton aria-label="Close" onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 0.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {preview ? (
              <Box
                component="img"
                src={preview}
                alt={alt}
                sx={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 1, bgcolor: "#eee" }}
              />
            ) : null}
            <TextField
              name="url"
              label="Image URL"
              placeholder="https://…"
              fullWidth
              defaultValue={image?.kind === "url" ? image.url : ""}
              onChange={handleUrlChange}
            />
            <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={{ alignSelf: "flex-start" }}>
              Upload an image
              <input type="file" name="file" accept="image/*" hidden onChange={handleFileChange} />
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: image ? "space-between" : "flex-end" }}>
          {image ? (
            <Button color="error" onClick={handleRemove}>
              Remove image
            </Button>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained">
              Save
            </Button>
          </Stack>
        </DialogActions>
      </form>
    </Dialog>
  );
}
