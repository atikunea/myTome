/**
 * The shape of `window.myTome`, declared once for the two sides that have to
 * agree on it: `preload.cts`, which builds it, and the renderer modules that
 * call it.
 *
 * **This file imports nothing** — not electron, not node, not anything under
 * `src/`. That is what lets the renderer's browser-only TypeScript program
 * include it without dragging Node globals into `src/`, and what lets the
 * desktop program include it without reaching into the app.
 */

/** A request the renderer asks the main process to make on its behalf. */
export interface DriveRequestInit {
  method?: string;
  headers?: Record<string, string>;
  /** Text only: every Drive call this app makes sends and receives text. */
  body?: string;
}

export interface DriveResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * `needs-reconnect` is a stored refresh token Google has stopped honouring —
 * revoked in the account, expired, or invalidated by a password change. It is
 * a state the author has to resolve, and the UI must say so rather than
 * retrying quietly forever.
 */
export type DriveBridgeState = "disconnected" | "connected" | "needs-reconnect";

export interface DriveSession {
  state: DriveBridgeState;
  /** The Google account, when Drive's `about` endpoint would name one. */
  account?: string;
  /**
   * Whether the refresh token can be kept at all. False when the OS has no
   * usable credential store — see `desktop/vault.ts`, which refuses to write a
   * bearer credential in the clear. The author can still connect; they will
   * just be asked again next launch, and the UI should tell them why.
   */
  canStaySignedIn: boolean;
}

export interface DriveBridge {
  /** Opens the system browser and runs the installed-app flow. */
  authorize(): Promise<DriveSession>;
  /** What the main process currently holds, asked once when the app starts. */
  session(): Promise<DriveSession>;
  /** Hands the grant back to Google and clears the stored token. */
  revoke(): Promise<void>;
  /**
   * One authorized Drive call, made by the main process. The renderer never
   * sees a token, which is the point of routing this through IPC at all.
   */
  request(url: string, init?: DriveRequestInit): Promise<DriveResponse>;
}

/** A native dialog's file-type filter. Extensions carry no leading dot. */
export interface BridgeFileFilter {
  name: string;
  extensions: string[];
}

/**
 * Native open and save dialogs.
 *
 * **The renderer supplies a suggested name, never a path.** Where the file
 * actually lands is whatever the dialog returned, which is why writing needs
 * no allowlist the way `DriveBridge.request` does: the author chose it.
 */
export interface FilesBridge {
  save(request: {
    suggestedName: string;
    filters: BridgeFileFilter[];
    bytes: Uint8Array;
  }): Promise<{ saved: boolean; name?: string }>;

  /** Null when the author cancelled. */
  open(options: {
    filters: BridgeFileFilter[];
  }): Promise<{ name: string; bytes: Uint8Array } | null>;
}

/**
 * Automatic backup export: a folder the author chose, that the app keeps
 * writing whole-library backup files into.
 *
 * **The folder lives here, in the main process, and the renderer never names
 * one.** It picks it once through a dialog and is afterwards told only what it
 * is, for showing back to the author. That is the same rule `FilesBridge`
 * follows, and it is what makes an unattended, repeating write safe: the page
 * can ask for *an* export, never an export *there*.
 *
 * The file name is the main process's too, for a sharper reason — see
 * `desktop/files.ts`. Pruning deletes, and a pruner that deleted whatever the
 * renderer named would be a renderer that could delete anything in the folder.
 */
export interface BackupBridge {
  /** The remembered folder, or undefined when the author has not picked one. */
  folder(): Promise<string | undefined>;

  /** Opens a folder dialog. The chosen folder, or null when cancelled. */
  chooseFolder(): Promise<string | null>;

  /** Forgets the folder. Nothing further is written, and nothing is deleted. */
  forgetFolder(): Promise<void>;

  /**
   * Writes one export into the remembered folder, then deletes its own older
   * files until `keep` remain. Rejects when no folder is set.
   */
  write(request: { bytes: Uint8Array; keep: number }): Promise<AutoExportWrite>;
}

export interface AutoExportWrite {
  /** What it was written as — a name, never a path. */
  fileName: string;
  /** How many older automatic exports the retention rule removed. */
  pruned: number;
}

export interface MyTomeBridge {
  readonly isDesktop: true;
  readonly platform: string;
  readonly versions: { app: string; electron: string; chrome: string };
  readonly files: FilesBridge;
  readonly backup: BackupBridge;
  /** Absent when the build carries no Google credentials. */
  readonly drive?: DriveBridge;
}
