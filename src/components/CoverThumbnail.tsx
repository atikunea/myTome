import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ImageSource } from "../models/Tome";
import { useImageSrc } from "../hooks/useObjectUrl";

/** Hard-stopped 2px lines at even heights, one per colour: threads, not a wash. */
const threadStripes = (colors: readonly string[]) =>
  colors
    .map((color, i) => {
      const at = `${((i + 1) * 100) / (colors.length + 1)}%`;
      return `linear-gradient(to bottom, transparent calc(${at} - 1px), ${color} calc(${at} - 1px), ${color} calc(${at} + 1px), transparent calc(${at} + 1px))`;
    })
    .join(", ");

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
          { display: "block", width: "100%", objectFit: "cover", bgcolor: (t) => t.loom.panel },
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
        // A tome without a cover is drawn as Loom draws a book: three threads
        // across its own well, and its initial over them.
        bgcolor: (t) => t.loom.panel,
        backgroundImage: (t) => threadStripes(t.loom.threads.slice(0, 3)),
        color: "text.primary",
        fontWeight: 700,
        letterSpacing: "-0.04em",
        fontSize: "3rem",
        ...sx,
      }}
    >
      {label.slice(0, 1).toUpperCase()}
    </Box>
  );
}
