import type { BackupTransport } from "./backupTransport";

/**
 * The web has no answer to this one.
 *
 * A page cannot be given a folder it may write to unattended. The File System
 * Access API comes closest, and deliberately does not go there: a handle needs
 * the author's permission, browsers re-prompt across sessions, and Firefox and
 * Safari do not implement the writable half at all. A feature whose whole
 * value is that it happens without being asked cannot be built on a thing that
 * asks.
 *
 * So this half exists to be *absent* rather than to pretend. `supported` is
 * false, `AutoExportCard` renders nothing, and the calls below throw if
 * something ever reaches them — which would be a bug, not a platform
 * difference, and should say so loudly rather than resolve to nothing.
 */

const unreachable = (): never => {
  throw new Error("Automatic backup export is part of the desktop app.");
};

export const transport: BackupTransport = {
  supported: false,
  folder: async () => undefined,
  chooseFolder: unreachable,
  forgetFolder: unreachable,
  write: unreachable,
};
