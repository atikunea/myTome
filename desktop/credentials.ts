import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the desktop build's Google credentials come from.
 *
 * Two sources, in order:
 *
 * 1. **The environment** — how a development run supplies them, and how CI
 *    would override a build.
 * 2. **`credentials.json` beside this file** — written at package time by
 *    `scripts/desktop-credentials.cjs`, because environment variables set on a
 *    build machine plainly do not reach an author's installed copy.
 *
 * Neither is ever a file in the repository. `AGENTS.md`'s rule that the repo
 * never gains a secret stays literally true: these are build inputs, and
 * `dist-electron/` is git-ignored.
 *
 * **The client secret is not confidential, and nothing here pretends it is.**
 * RFC 8252 §8.5 is explicit that a credential shipped inside an installed
 * application can be extracted by anyone; PKCE is what actually protects the
 * exchange, and `drive.file` is what bounds the damage if someone bothers. It
 * is injected rather than committed so that a fork of this repo is never
 * quietly talking to someone else's Google project — the same reason the web
 * build takes its client id from an environment variable.
 *
 * With neither source present the Drive feature is simply absent: the preload
 * exposes no bridge, and the card on `/backup` reads as "not set up in this
 * build".
 */

export interface DesktopCredentials {
  clientId: string;
  clientSecret: string;
}

const EMPTY: DesktopCredentials = { clientId: "", clientSecret: "" };

const fromEnvironment = (): DesktopCredentials | undefined => {
  const clientId = process.env["MYTOME_GOOGLE_CLIENT_ID"]?.trim();
  const clientSecret = process.env["MYTOME_GOOGLE_CLIENT_SECRET"]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
};

const fromBundle = (): DesktopCredentials | undefined => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // `readFileSync` reads straight out of `app.asar`; Electron patches `fs`
    // for exactly this.
    const raw = readFileSync(path.join(here, "credentials.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<DesktopCredentials>;
    const clientId = parsed.clientId?.trim();
    const clientSecret = parsed.clientSecret?.trim();
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
  } catch {
    // Absent is the ordinary case for a build with no Drive credentials.
    return undefined;
  }
};

export const credentials: DesktopCredentials = fromEnvironment() ?? fromBundle() ?? EMPTY;

export const configured = Boolean(credentials.clientId && credentials.clientSecret);
