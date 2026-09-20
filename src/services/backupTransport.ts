/**
 * Whether this build can keep writing backup files somewhere by itself.
 *
 * It cannot on the web, and that is not a gap to be filled later: a page has
 * no folder it may write to unattended, and every API that comes close asks
 * the author to confirm each time — which is the opposite of automatic. So
 * this seam has a real half and an honest empty one, unlike `#fileTransport`
 * and `#driveTransport`, where both platforms can do the job differently.
 *
 * `supported` is what the UI reads. `AutoExportCard` renders nothing at all on
 * the web rather than describing a feature that build does not have, which is
 * the one difference from `DriveSyncCard` — an unconfigured Drive build still
 * *could* have Drive, so it says so.
 *
 * The desktop half is a message to the main process in every case. **Nothing
 * here takes or returns a path the renderer chose**: `folder()` reports back
 * what the author picked in a dialog, for showing them, and `write()` names
 * neither the folder nor the file. See `desktop/files.ts` for why the naming
 * sits on that side.
 */

export interface AutoExportWrite {
  /** What the file was written as — a name, never a path. */
  fileName: string;
  /** How many older automatic exports the retention rule removed. */
  pruned: number;
}

export interface BackupTransport {
  /** False on the web. Everything below is unreachable when it is. */
  readonly supported: boolean;

  /** The chosen folder, for showing the author. Undefined until they pick one. */
  folder(): Promise<string | undefined>;

  /** Opens a folder dialog. Null when the author cancelled. */
  chooseFolder(): Promise<string | null>;

  /** Stops the writing. Never deletes anything already written. */
  forgetFolder(): Promise<void>;

  /**
   * Writes one whole-library backup into the chosen folder and prunes older
   * automatic exports until `keep` of them remain. Rejects when no folder has
   * been chosen.
   */
  write(request: { data: Blob; keep: number }): Promise<AutoExportWrite>;
}
