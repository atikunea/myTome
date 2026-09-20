import type { MyTomeBridge } from "../../desktop/bridge";
import type { BackupTransport } from "./backupTransport";

/**
 * The desktop half: four messages to the main process, and no decisions.
 *
 * *When* to export and *whether* anything has changed are `autoExport.ts`'s
 * business, because they are questions about a library and the main process
 * does not know what one is. What crosses here is bytes, a retention count,
 * and the answer.
 */

const bridge = (globalThis as { myTome?: MyTomeBridge }).myTome;
const backup = () => {
  if (!bridge?.backup) throw new Error("The desktop bridge is not available.");
  return bridge.backup;
};

/**
 * Electron prefixes every rejected `invoke` with `Error invoking remote method
 * '<channel>': Error: ` before it reaches the renderer.
 *
 * That matters here and not in the other two desktop halves, because these
 * messages are shown to the author as written — "The backup folder is no
 * longer there", "There is no room left on that disk" — and an IPC channel
 * name in front of them is noise about our plumbing, not about their disk.
 */
const unwrap = (cause: unknown): Error => {
  const message = cause instanceof Error ? cause.message : String(cause);
  const stripped = message.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, "");
  return new Error(stripped || "The backup could not be written.");
};

const ask = async <T>(what: () => Promise<T>): Promise<T> => {
  try {
    return await what();
  } catch (cause) {
    throw unwrap(cause);
  }
};

export const transport: BackupTransport = {
  supported: Boolean(bridge?.backup),

  folder: async () => (bridge?.backup ? backup().folder() : undefined),

  chooseFolder: () => ask(() => backup().chooseFolder()),

  forgetFolder: () => ask(() => backup().forgetFolder()),

  write: async ({ data, keep }) => {
    const bytes = new Uint8Array(await data.arrayBuffer());
    return ask(() => backup().write({ bytes, keep }));
  },
};
