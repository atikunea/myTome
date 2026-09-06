import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ImageSource } from "../models/Tome";
import { useImageSrc } from "../hooks/useObjectUrl";

/**
 * A cover, or a monogram standing in for one. `sx` sizes both — callers are
 * almost all thumbnails, wanting one fixed box whichever branch renders.
 * `imageSx` lands after it, on the image alone, for the caller that wants the
 * picture at its own proportions and has no use for those proportions when
 * there is no picture to have them.
 */
export function CoverThumbnail({
  image,
  label,
  alt,
  sx,
  imageSx,
}: {
  image?: ImageSource;
  label: string;
  alt: string;
  sx?: SxProps<Theme>;
  imageSx?: SxProps<Theme>;
}) {
  const url = useImageSrc(image);
  if (url)
    return (
      <Box
        component="img"
        src={url}
        alt={alt}
        sx={[
          { display: "block", width: "100%", objectFit: "cover", bgcolor: "#eee" },
          // MUI's array form rather than a spread: an `SxProps` may be an array or
          // a callback, and spreading two of them widens every property past
          // what `sx` accepts.
          ...(Array.isArray(sx) ? sx : [sx]),
          ...(Array.isArray(imageSx) ? imageSx : [imageSx]),
        ]}
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
