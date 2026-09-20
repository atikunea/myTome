import { fileURLToPath } from "node:url";
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

    resolve: {
      alias: {
        /**
         * Which Drive transport `services/drive.ts` gets, decided here rather
         * than by a runtime `if`. An alias makes each bundle *unable* to
         * contain the other's code: the web bundle never carries the IPC
         * client, and the desktop bundle never carries Google's script loader
         * — which its stricter CSP would refuse to run anyway.
         *
         * `tsconfig.json` maps the same specifier to the web implementation,
         * which is what types it. Both satisfy `DriveTransport`, so either
         * would do.
         */
        "#driveTransport": fileURLToPath(
          new URL(
            desktop
              ? "./src/services/driveTransport.desktop.ts"
              : "./src/services/driveTransport.web.ts",
            import.meta.url,
          ),
        ),

        /** The same arrangement for native file dialogs. */
        "#fileTransport": fileURLToPath(
          new URL(
            desktop
              ? "./src/services/fileTransport.desktop.ts"
              : "./src/services/fileTransport.web.ts",
            import.meta.url,
          ),
        ),
      },
    },
    plugins: desktop ? [react()] : [react(), cspPlugin()],
    ...(desktop
      ? { define: { "import.meta.env.VITE_GOOGLE_CLIENT_ID": '""' } }
      : {}),
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      watch: {
        /**
         * Vite watches the project root recursively, and its defaults exclude
         * `node_modules` and `dist` but nothing the desktop build produces.
         *
         * That costs more than wasted work. On Windows a watcher handle on a
         * directory blocks renaming it, and packaging extracts Electron into
         * `release/win-unpacked.tmp` and then renames it — so with `npm run
         * dev` running, `npm run desktop:package` fails with `EPERM ... rename
         * 'win-unpacked.tmp' -> 'win-unpacked'` and nothing explains why. The
         * extraction takes long enough for the watcher to notice the new
         * directory, which is why a quick rename by hand in the same folder
         * succeeds and looks like a contradiction.
         */
        ignored: ["**/release/**", "**/dist-electron/**"],
      },
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
