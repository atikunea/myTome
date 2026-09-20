import type { ImageSource } from "../models/Tome";

/**
 * The address of an image that already has one. A `kind: "local"` image is a
 * Blob with no address until someone mints one, and minting is a resource
 * acquisition rather than a read — `hooks/useObjectUrl.ts` owns that, so this
 * allocates nothing and is safe to call from anywhere, including a render body.
 */
export const imageHref = (image?: ImageSource) =>
  image?.kind === "url" ? image.url : undefined;

export const imageFrom = async (
  url: string,
  // A `Blob`, not a `File`: all this does with it is store it, and the desktop
  // build's picker returns bytes read by the main process rather than a `File`
  // the browser handed out.
  file?: Blob,
): Promise<ImageSource | undefined> => {
  if (file) return { kind: "local", blob: file };
  if (!url.trim()) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new Error("Image URLs must use https.");
  return { kind: "url", url: parsed.toString() };
};
