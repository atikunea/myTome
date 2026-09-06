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
  file?: File,
): Promise<ImageSource | undefined> => {
  if (file) return { kind: "local", blob: file };
  if (!url.trim()) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new Error("Image URLs must use https.");
  return { kind: "url", url: parsed.toString() };
};
