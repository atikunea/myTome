import type { ImageSource } from "../models/Tome";

export const imageUrl = (image?: ImageSource) =>
  image?.kind === "url"
    ? image.url
    : image?.kind === "local"
      ? URL.createObjectURL(image.blob)
      : undefined;

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
