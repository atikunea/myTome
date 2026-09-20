import { app, safeStorage } from "electron";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Where the Drive refresh token is kept.
 *
 * This is the one thing the desktop build stores that is worth stealing, and
 * the rule it follows is narrow: **encrypted by the operating system, or not
 * written at all.** DPAPI on Windows, the Keychain on macOS, libsecret on
 * Linux — via Electron's `safeStorage`, which picks the right one.
 *
 * It is deliberately not the same rule as the *access* token, which still
 * never leaves memory. A refresh token is the thing that has to survive a
 * restart, which is the entire point of the desktop build, and surviving a
 * restart means touching a disk.
 *
 * **`isEncryptionAvailable()` is not a sufficient check, and Linux is why.**
 * When no keyring is present — a minimal desktop, a headless session, some
 * distributions out of the box — Electron falls back to a `basic_text` backend
 * that "encrypts" with a hardcoded key. That is obfuscation, and
 * `isEncryptionAvailable()` still returns `true` for it. Writing a bearer
 * credential through it would hand it in effective plaintext to exactly the
 * users least able to notice.
 *
 * This file is written on Windows, where that trap cannot fire. It is checked
 * anyway, because the day it matters no test will be watching.
 */

const FILE = "drive-token.bin";

const tokenPath = () => path.join(app.getPath("userData"), FILE);

/**
 * Whether a refresh token can be protected here at all.
 *
 * When this is false the app still works — the author connects, syncs, and is
 * asked again next launch. What it must never do is quietly downgrade to
 * storing the token unprotected.
 */
export const canPersist = (): boolean => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;

    // Linux only; the getter does not exist elsewhere, and elsewhere there is
    // no plaintext backend to guard against.
    if (process.platform === "linux") {
      const backend = safeStorage.getSelectedStorageBackend?.();
      if (!backend || backend === "basic_text") return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const save = (refreshToken: string): boolean => {
  if (!canPersist()) return false;
  try {
    const encrypted = safeStorage.encryptString(refreshToken);
    mkdirSync(path.dirname(tokenPath()), { recursive: true });
    writeFileSync(tokenPath(), encrypted);
    return true;
  } catch {
    // A disk that will not take it is not a reason to fall back to plaintext.
    return false;
  }
};

export const load = (): string | undefined => {
  if (!canPersist()) return undefined;
  try {
    const decrypted = safeStorage.decryptString(readFileSync(tokenPath()));
    return decrypted || undefined;
  } catch {
    // Missing is the ordinary case on a first run. Unreadable means the OS key
    // changed — a different Windows account, a restored Keychain — and the
    // only answer is to sign in again.
    return undefined;
  }
};

export const clear = (): void => {
  try {
    rmSync(tokenPath(), { force: true });
  } catch {
    // Nothing to do about it, and the in-memory token is dropped regardless.
  }
};
