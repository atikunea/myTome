import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ImageSource } from "../models/Tome";
import { imageUrl } from "../services/store";

export function CoverThumbnail({
  image,
  label,
  alt,
  sx,
}: {
  image?: ImageSource;
  label: string;
  alt: string;
  sx?: SxProps<Theme>;
}) {
  const url = imageUrl(image);
  if (url)
    return (
      <Box
        component="img"
        src={url}
        alt={alt}
        sx={{ display: "block", width: "100%", objectFit: "cover", bgcolor: "#eee", ...sx }}
      />
    );
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(135deg, #d7b799, #8e6048)",
        color: "#fff",
        fontFamily: "Georgia, serif",
        fontSize: "3rem",
        ...sx,
      }}
    >
      {label.slice(0, 1).toUpperCase()}
    </Box>
  );
}
