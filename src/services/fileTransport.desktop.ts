import type { MyTomeBridge } from "../../desktop/bridge";
import type { FileTransport } from "./fileTransport";

/**
 * Real dialogs, by way of the main process.
 *
 * The renderer hands over bytes and a suggested name; the shell shows the
 * dialog, and writes only where the author pointed it. Nothing here names a
 * path, and nothing gets one back — `save` reports the *name* a file went
 * under, which is all the UI needs to say what happened.
 */

const bridge = (globalThis as { myTome?: MyTomeBridge }).myTome;
const files = () => {
  if (!bridge?.files) throw new Error("The desktop bridge is not available.");
  return bridge.files;
};

/**
 * A `Blob` built from raw bytes has no type, and the type is not decoration:
 * `ImagePicker` stores the blob in Dexie and the cover is rendered from it, so
 * a picked PNG that came back as `application/octet-stream` would be a broken
 * image later and nowhere near here.
 *
 * Only what this app actually opens — a backup file, or a cover image.
 */
const CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

const contentTypeOf = (name: string) => {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
};

export const transport: FileTransport = {
  save: async ({ suggestedName, filters, data }) => {
    const bytes = new Uint8Array(await data.arrayBuffer());
    return files().save({ suggestedName, filters, bytes });
  },

  open: async ({ filters }) => {
    const picked = await files().open({ filters });
    if (!picked) return null;
    return {
      name: picked.name,
      // `BlobPart` excludes a view over a `SharedArrayBuffer`, which this can
      // never be: it came from `fs.readFile` in the main process and crossed
      // IPC as an ordinary `Uint8Array`.
      blob: new Blob([picked.bytes as BlobPart], { type: contentTypeOf(picked.name) }),
    };
  },
};
