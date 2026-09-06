import { useLayoutEffect, useState } from "react";
import type { ImageSource } from "../models/Tome";
import { imageHref } from "../services/store";

/**
 * A Blob, addressable for as long as this component renders it.
 *
 * `URL.createObjectURL` hands its caller a handle with a lifetime, not a
 * value, and the caller owns the matching revoke. A component that *stores*
 * that handle inherits the bookkeeping — revoke before overwriting, revoke on
 * close, revoke on unmount — and every path that sets it becomes a path that
 * can leak. Calling it in a render body is the worst case: one URL per render,
 * each pinning the Blob for the life of the document.
 *
 * So hold the Blob, which is an inert value, and let this derive the URL. The
 * effect is keyed on the Blob and revokes on unmount and on change, which is
 * the whole of the bookkeeping, in one place.
 *
 * It is a *layout* effect on purpose: with `useEffect` the URL lands after the
 * first paint, so a caller with a fallback paints the fallback and flashes the
 * real content in behind it.
 *
 * **Pass a stable Blob** — one from the store, or one held in state. A Blob
 * built inline in the render body is a new object every render, which trades
 * the leak for re-creating the URL on every pass.
 *
 * This is for a URL that lives as long as a rendered element. A URL that lives
 * as long as a single action — the `<a download>` dance in `BackupPage` and
 * `ManuscriptExportDialog` — belongs in the handler that creates it, where
 * create/click/revoke already sit together.
 */
export function useObjectUrl(blob?: Blob | null) {
  const [url, setUrl] = useState<string>();

  useLayoutEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}

/**
 * The `ImageSource` union resolved to something an `<img src>` can take: an
 * uploaded blob through `useObjectUrl`, a pasted https link straight through.
 * A local image is undefined for the first render, before the layout effect
 * commits — callers already render a fallback for "no image at all".
 */
export function useImageSrc(image?: ImageSource) {
  const blobUrl = useObjectUrl(image?.kind === "local" ? image.blob : undefined);
  return blobUrl ?? imageHref(image);
}
