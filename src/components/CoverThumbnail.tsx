import { useLayoutEffect, useState } from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ImageSource } from "../models/Tome";

/**
 * A `kind: "local"` cover is a Blob, and `imageUrl` mints a fresh object URL
 * every time it is called — the caller owns the revoke. Calling it in a render
 * body therefore leaks one URL per render, so the blob case lives in an effect
 * that revokes on unmount and whenever the blob changes. A `kind: "url"` cover
 * allocates nothing and is read straight through.
 *
 * It is a layout effect so the URL is in place before the browser paints —
 * with `useEffect` the first frame shows the fallback monogram and the cover
 * flashes in behind it.
 */
function useCoverSrc(image?: ImageSource) {
  const blob = image?.kind === "local" ? image.blob : undefined;
  const [blobUrl, setBlobUrl] = useState<string>();

  useLayoutEffect(() => {
    if (!blob) {
      setBlobUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return image?.kind === "url" ? image.url : blobUrl;
}

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
  const url = useCoverSrc(image);
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
