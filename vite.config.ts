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

export default defineConfig({
  base: "/myTome/",
  plugins: [react(), cspPlugin()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/services/__tests__/setup.ts"],
  },
});
