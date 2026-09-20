import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * The one place the app is allowed to talk to. Everything is same-origin except
 * Google's sign-in script and the two hosts Drive sync calls; `img-src https:`
 * is for cover images pasted as URLs, and `style-src 'unsafe-inline'` is
 * unavoidable with emotion, which is how MUI styles every component.
 *
 * An XSS in this app would now be able to reach a Drive token, so this is worth
 * having even though it cannot be perfect.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com",
  "frame-src https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

/**
 * GitHub Pages serves no headers we control, so the policy has to ride in the
 * document. Build only: the dev server needs inline scripts, `eval`, and a
 * websocket for HMR, and a policy strict enough to be worth shipping would
 * break all three.
 */
const cspPlugin = (): Plugin => ({
  name: "mytome-csp",
  apply: "build",
  transformIndexHtml: (html) => ({
    html,
    tags: [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: contentSecurityPolicy,
        },
        injectTo: "head-prepend",
      },
    ],
  }),
});

/**
 * Two builds out of one `src/`.
 *
 * The web build is unchanged: the `/myTome/` subpath GitHub Pages serves from,
 * and the policy above riding in the document because Pages serves no headers
 * we control.
 *
 * The desktop build differs in exactly three ways, and no more. It loads from
 * a custom scheme rather than a subpath, so `base` is relative. It gets its
 * Content-Security-Policy as a real header from `desktop/main.ts` — stricter
 * than the one above, since that renderer never loads Google's script — so the
 * meta tag would only duplicate it. And it carries no OAuth client id: Drive
 * arrives in phase 2 through the transport seam in `services/`, driven by the
 * main process, never by the browser flow the web build uses.
 *
 * See docs/desktop-app.md, "Keeping the web build clean".
 */
export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";

  return {
    base: desktop ? "./" : "/myTome/",
    plugins: desktop ? [react()] : [react(), cspPlugin()],
    ...(desktop
      ? { define: { "import.meta.env.VITE_GOOGLE_CLIENT_ID": '""' } }
      : {}),
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
    },
    test: {
      environment: "node",
      // `desktop/` is already a `node` program, so its pure modules — PKCE,
      // the callback parser, the export scheduler — test here rather than
      // needing a suite of their own. Nothing matches it yet.
      include: ["src/**/*.test.ts", "desktop/**/*.test.ts"],
      setupFiles: ["src/services/__tests__/setup.ts"],
    },
  };
});
