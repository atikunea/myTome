import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { buildAuthUrl, createPkcePair, createState, parseCallback, SCOPE } from "../oauth.js";

/**
 * The parts of the OAuth flow that are only data, tested where the rest of it
 * cannot be: the real thing needs a browser, a Google account and a live
 * network, and `npm test` has none of those.
 *
 * `parseCallback` is the one that earns a test outright. Everything it rejects
 * is something a browser would otherwise hand straight to the token exchange,
 * and a `state` check that silently passed would be a CSRF hole rather than a
 * bug anyone would notice.
 */

describe("PKCE", () => {
  it("derives the challenge as the S256 digest of the verifier", () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("produces base64url only — no padding or characters a query string would escape", () => {
    for (let i = 0; i < 20; i++) {
      const { verifier, challenge } = createPkcePair();
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("is long enough to be worth having, and within what RFC 7636 allows", () => {
    const { verifier } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("never repeats a verifier or a state", () => {
    const verifiers = new Set(Array.from({ length: 50 }, () => createPkcePair().verifier));
    const states = new Set(Array.from({ length: 50 }, () => createState()));
    expect(verifiers.size).toBe(50);
    expect(states.size).toBe(50);
  });
});

describe("buildAuthUrl", () => {
  const url = () =>
    new URL(
      buildAuthUrl({
        clientId: "client-1",
        redirectUri: "http://127.0.0.1:51234/callback",
        challenge: "challenge-1",
        state: "state-1",
      }),
    );

  it("asks for offline access and forces consent, which is what yields a refresh token", () => {
    const params = url().searchParams;
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
  });

  it("uses S256 and carries the challenge, never the verifier", () => {
    const params = url().searchParams;
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBe("challenge-1");
    expect(url().toString()).not.toContain("code_verifier");
  });

  it("requests drive.file and nothing else", () => {
    expect(url().searchParams.get("scope")).toBe(SCOPE);
    expect(SCOPE).toBe("https://www.googleapis.com/auth/drive.file");
  });

  it("goes to Google over https", () => {
    expect(url().origin).toBe("https://accounts.google.com");
  });
});

describe("parseCallback", () => {
  const state = "the-expected-state";

  it("returns the code when the state matches", () => {
    const result = parseCallback(`/callback?code=abc123&state=${state}`, state);
    expect(result).toEqual({ ok: true, code: "abc123" });
  });

  it("rejects a mismatched state even when a code is present", () => {
    const result = parseCallback(`/callback?code=abc123&state=somebody-elses`, state);
    expect(result.ok).toBe(false);
  });

  it("rejects a missing state", () => {
    expect(parseCallback("/callback?code=abc123", state).ok).toBe(false);
  });

  it("checks the state before it looks at an error, so a foreign response is never reported as ours", () => {
    const result = parseCallback("/callback?error=access_denied&state=wrong", state);
    expect(result).toEqual({
      ok: false,
      error: "The sign-in response did not match this request.",
    });
  });

  it("says plainly when the author declined", () => {
    const result = parseCallback(`/callback?error=access_denied&state=${state}`, state);
    expect(result).toEqual({ ok: false, error: "Sign-in was declined." });
  });

  it("reports any other refusal by name", () => {
    const result = parseCallback(`/callback?error=invalid_scope&state=${state}`, state);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("invalid_scope");
  });

  it("refuses a request for any other path", () => {
    const result = parseCallback(`/../etc/passwd?code=abc&state=${state}`, state);
    expect(result.ok).toBe(false);
  });

  it("refuses a favicon request the browser makes alongside the redirect", () => {
    expect(parseCallback("/favicon.ico", state).ok).toBe(false);
  });

  it("rejects a matching state that carries no code", () => {
    const result = parseCallback(`/callback?state=${state}`, state);
    expect(result).toEqual({ ok: false, error: "Google sent back no authorization code." });
  });

  it("does not treat a state that merely starts with the expected one as a match", () => {
    const result = parseCallback(`/callback?code=abc&state=${state}-and-more`, state);
    expect(result.ok).toBe(false);
  });
});
