/**
 * What `drive.ts` needs from the platform — and the only thing about Drive
 * that differs between the web app and the desktop build.
 *
 * `drive.ts` owns everything *about Drive*: the folder, the three kinds of
 * file, `appProperties`, the plan, the merge, the race check on
 * `modifiedTime`. None of that is platform-specific, and none of it moved.
 *
 * What is platform-specific is narrower than it looks — how a token is
 * obtained, where it is kept, and who attaches it to a request:
 *
 * - **On the web**, Google Identity Services opens a pop-up, the token lives
 *   in a module variable for about an hour, there is no refresh token, and the
 *   tab itself calls googleapis.
 * - **On the desktop**, the system browser runs the installed-app flow, a
 *   refresh token is kept encrypted by the operating system, and the **main
 *   process** makes every call. The renderer never holds a token at all, which
 *   is a security improvement over the web app rather than merely a different
 *   arrangement: an XSS in the tab has nothing to steal.
 *
 * The implementation is chosen **at build time**. `vite.config.ts` aliases
 * `#driveTransport` to one file or the other, so the web bundle cannot contain
 * the desktop code and the desktop bundle cannot contain Google's script
 * loader — which its stricter CSP would refuse to run in any case.
 */

/**
 * What the Drive card shows.
 *
 * `needs-reconnect` exists only on the desktop: it is a stored refresh token
 * that Google has stopped honouring — revoked in the account, expired, or
 * invalidated by a password change. The web build has no refresh token to lose
 * and so never reaches it.
 */
export type DriveState = "unconfigured" | "disconnected" | "connected" | "needs-reconnect";

export interface DriveTransport {
  /** Whether this build carries credentials at all. */
  readonly configured: boolean;

  /** Cached, so rendering stays synchronous. `resume()` is what updates it. */
  state(): DriveState;

  /**
   * Picks up a session this build may already hold, once, when the Drive card
   * mounts.
   *
   * The web build has nothing to resume — a pop-up token dies with the tab —
   * so this is a no-op there. The desktop build may have a refresh token the
   * OS kept across restarts, and the author should find themselves signed in
   * rather than having to ask again.
   */
  resume(): Promise<DriveState>;

  /**
   * The signed-in account, when the platform can name one. Never worth a wider
   * scope: the desktop build reads it from Drive's own `about` endpoint, which
   * `drive.file` already allows, and leaves it undefined if that call fails.
   */
  accountLabel(): string | undefined;

  /**
   * Whether a connection can outlive the session. False on the web always, and
   * on a desktop whose OS has no usable credential store — the card should say
   * why the author will be asked again, rather than looking broken.
   */
  canStaySignedIn(): boolean;

  connect(): Promise<void>;

  /** Hands the grant back to Google and forgets it. The honest reading of "disconnect". */
  disconnect(): Promise<void>;

  /**
   * One authorized call.
   *
   * The implementation attaches the token and deals with a 401 by getting a
   * fresh one and retrying **once**. It does not interpret Drive's errors —
   * that is `drive.ts`'s job, and it is the same on both platforms.
   */
  request(url: string, init?: RequestInit): Promise<Response>;
}
