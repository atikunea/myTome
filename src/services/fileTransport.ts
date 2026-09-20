/**
 * Getting a file out of the app, and getting one in.
 *
 * The web app has exactly two ways to do this, both of them tricks: an `<a
 * download>` that is clicked and thrown away, and a hidden `<input
 * type="file">`. Neither lets the author say *where*, neither can tell you
 * whether they went through with it, and both hand the browser's download
 * folder a file the author then has to go and find.
 *
 * The desktop build has real dialogs. This is the seam between them, chosen at
 * build time by a Vite alias exactly as `driveTransport.ts` is — so no page or
 * component ever asks whether it is running in Electron. A component that
 * branched on the platform once would branch on it everywhere.
 *
 * **The renderer never names a path.** It offers a *suggested* filename and
 * the author picks the rest; the desktop implementation writes only where the
 * dialog said to. That is the whole reason a save is safe without an
 * allowlist, unlike `driveTransport`'s request URLs.
 */

/** A native dialog's file-type filter. The web build reads `accept` instead. */
export interface FileFilter {
  name: string;
  /** Without the dot: `["json"]`, `["docx"]`, `["png", "jpg"]`. */
  extensions: string[];
}

export interface SaveRequest {
  /** What the dialog opens with. The author may change it. */
  suggestedName: string;
  filters: FileFilter[];
  data: Blob;
}

export interface SaveResult {
  /** False when the author cancelled. */
  saved: boolean;
  /**
   * The name it was written under, when the platform knows it — so the UI can
   * say *what* was saved. Deliberately the name and not the path: the page has
   * no use for a filesystem location, and no business holding one.
   */
  name?: string;
}

export interface PickedFile {
  name: string;
  blob: Blob;
}

export interface FileTransport {
  /**
   * Writes a file out.
   *
   * **The web build cannot tell a cancel from a success** — a click on an `<a
   * download>` reports nothing either way — so it always answers `saved: true`.
   * Callers must not treat that as proof the author kept the file, only as
   * "nothing went wrong here".
   */
  save(request: SaveRequest): Promise<SaveResult>;

  /** Null when the author cancelled. */
  open(options: {
    /** The web build's `<input accept>`. */
    accept: string;
    filters: FileFilter[];
  }): Promise<PickedFile | null>;
}
