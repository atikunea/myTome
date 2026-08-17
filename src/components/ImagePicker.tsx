import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
import { imageFrom, imageUrl } from "../services/store";

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
  const url = imageUrl(image);

  return (
    <>
      <ButtonBase
        onClick={() => setOpen(true)}
        aria-label={url ? `Change ${alt}` : `Add ${alt}`}
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
        {url ? (
          <Box
            component="img"
            src={url}
            alt={alt}
            sx={{ display: "block", width: "100%", height: "100%", objectFit: "cover", bgcolor: "#eee" }}
          />
        ) : (
          <Box
            aria-hidden="true"
            sx={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, #d7b799, #8e6048)",
              color: "#fff",
              fontFamily: "Georgia, serif",
              fontSize: "3rem",
            }}
          >
            {label.slice(0, 1).toUpperCase()}
          </Box>
        )}
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
          <Typography variant="body2">{url ? "Change image" : "Add image"}</Typography>
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
  const [preview, setPreview] = useState<string | undefined>();
  const objectUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setError("");
      setPreview(imageUrl(image));
    }
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const replacePreview = (next: string | undefined) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = undefined;
    setPreview(next);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return replacePreview(imageUrl(image));
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreview(url);
  };

  const handleUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    replacePreview(value || imageUrl(image));
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
