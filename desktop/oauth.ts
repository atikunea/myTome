import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Google's installed-app OAuth flow, RFC 8252 — the reason the desktop build
 * exists.
 *
 * A browser page cannot hold a refresh token safely and there is no server to
 * hold one for us, so the web app re-consents every hour. An installed
 * application can do better, and this is how: PKCE, the **system browser**, and
 * a loopback redirect.
 *
 * Two rules shape everything here.
 *
 * **The authorization page opens in the author's real browser**, never in a
 * `BrowserWindow`. Google rejects OAuth in embedded webviews outright
 * (`disallowed_useragent`), and is right to — the author must be able to see
 * the address bar and their own signed-in session.
 *
 * **PKCE is what protects the exchange, not the client secret.** Google's
 * desktop client type issues a secret, and RFC 8252 §8.5 is explicit that a
 * credential shipped inside an installed application is not confidential:
 * anyone can extract it. The `code_verifier` never leaves this process, which
 * is what makes an intercepted `code` useless.
 *
 * The loopback listener is the only socket this app ever binds. It is on
 * `127.0.0.1`, on an ephemeral port, alive for the seconds between opening the
 * browser and receiving the redirect, and it answers exactly one path.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/** Per-file access to files this app created. Never widened. */
export const SCOPE = "https://www.googleapis.com/auth/drive.file";

/** The one path the loopback listener answers. */
const CALLBACK_PATH = "/callback";

export interface PkcePair {
  verifier: string;
  challenge: string;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** S256, which is the only method Google accepts for installed apps. */
export const createPkcePair = (): PkcePair => {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};

export const createState = () => base64url(randomBytes(16));

/**
 * Compared in constant time and length-first, because `timingSafeEqual` throws
 * on a length mismatch rather than returning false.
 */
const sameState = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const buildAuthUrl = (options: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string => {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("code_challenge", options.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", options.state);
  // Together these are what actually produce a refresh token. `offline` asks
  // for one; `consent` forces the screen even on a grant already given, which
  // is what makes a *re*-connect hand back a refresh token rather than an
  // access token alone.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
};

export type CallbackResult = { ok: true; code: string } | { ok: false; error: string };

/**
 * Reads the redirect Google sent back. Pure, and tested: this is the function
 * that decides whether a `state` mismatch is caught, and a mistake here is a
 * CSRF hole rather than a bug someone notices.
 */
export const parseCallback = (rawUrl: string, expectedState: string): CallbackResult => {
  let url: URL;
  try {
    // The request line is a path, not an absolute URL; the origin is arbitrary
    // and only there to satisfy the parser.
    url = new URL(rawUrl, "http://127.0.0.1");
  } catch {
    return { ok: false, error: "Google sent back something unreadable." };
  }

  if (url.pathname !== CALLBACK_PATH) {
    return { ok: false, error: "Unexpected callback path." };
  }

  const state = url.searchParams.get("state") ?? "";
  // Checked before the code is even looked at: a response whose state does not
  // match is not ours, whatever else it carries.
  if (!sameState(state, expectedState)) {
    return { ok: false, error: "The sign-in response did not match this request." };
  }

  const error = url.searchParams.get("error");
  if (error) {
    return {
      ok: false,
      error:
        error === "access_denied"
          ? "Sign-in was declined."
          : `Google refused the sign-in (${error}).`,
    };
  }

  const code = url.searchParams.get("code");
  if (!code) return { ok: false, error: "Google sent back no authorization code." };
  return { ok: true, code };
};

export interface Loopback {
  redirectUri: string;
  /** Resolves with the authorization code, or rejects with something sayable. */
  waitForCode: () => Promise<string>;
  close: () => void;
}

const donePage = (message: string) => `<!doctype html><meta charset="utf-8">
<title>myTome</title>
<body style="font:16px/1.6 Georgia,serif;margin:4rem auto;max-width:28rem;color:#29211e">
<h1 style="font-size:1.4rem">${message}</h1>
<p>You can close this tab and go back to myTome.</p>`;

/**
 * Binds `127.0.0.1` on an ephemeral port. Google accepts any port on the
 * loopback address for a desktop client, so nothing here has to be registered
 * in the console — which is also why the redirect URI is built after binding
 * rather than before.
 */
export const startLoopback = async (expectedState: string): Promise<Loopback> => {
  let settle: ((result: CallbackResult) => void) | null = null;
  const landed = new Promise<CallbackResult>((resolve) => (settle = resolve));

  const server: Server = createServer((req, res) => {
    const result = parseCallback(req.url ?? "", expectedState);
    res.writeHead(result.ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(donePage(result.ok ? "Signed in." : result.error));
    settle?.(result);
    settle = null;
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  return {
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    waitForCode: async () => {
      const result = await landed;
      if (!result.ok) throw new Error(result.error);
      return result.code;
    },
    close: () => server.close(),
  };
};

export interface TokenSet {
  accessToken: string;
  /** Absent when Google re-issues without one, which a refresh normally does. */
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

interface TokenPayload {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const postToken = async (body: Record<string, string>): Promise<TokenSet> => {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as TokenPayload;
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ?? payload.error ?? `Google returned ${response.status}.`,
    );
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    // A minute of slack, so a token is never spent in the instant it expires.
    expiresAt: Date.now() + ((payload.expires_in ?? 3600) - 60) * 1000,
  };
};

export const exchangeCode = (options: {
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
}) =>
  postToken({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code: options.code,
    code_verifier: options.verifier,
    redirect_uri: options.redirectUri,
    grant_type: "authorization_code",
  });

export const refreshAccessToken = (options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) =>
  postToken({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    refresh_token: options.refreshToken,
    grant_type: "refresh_token",
  });

/**
 * Hands the grant back to Google. Best effort: a revoke that fails still
 * results in the local token being dropped, because "disconnect" must never
 * leave the author connected.
 */
export const revokeToken = async (token: string): Promise<void> => {
  await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
    method: "POST",
  }).catch(() => undefined);
};
