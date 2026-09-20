/**
 * Writes the desktop build's Google credentials into `dist-electron/` so a
 * packaged app carries them.
 *
 * Environment variables set on a build machine do not reach an author's
 * installed copy, so packaging has to bake them in. This reads them from the
 * environment or from a git-ignored `.env.desktop.local`, and writes
 * `dist-electron/credentials.json`, which `desktop/credentials.ts` reads and
 * `desktop/builder.yml` already includes in the bundle.
 *
 * **It is not an error to have no credentials.** A build without them simply
 * has no Drive feature, exactly as the web build behaves without a client id —
 * so this removes any stale file and says so, rather than failing the build.
 *
 * The client secret is not confidential (RFC 8252 §8.5); see
 * `desktop/credentials.ts`. It still never becomes a file in the repository:
 * `dist-electron/` and `*.local` are both git-ignored.
 */
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const target = path.join(projectRoot, "dist-electron", "credentials.json");
const envFile = path.join(projectRoot, ".env.desktop.local");

/** A deliberately small reader: `KEY=value`, `#` comments, optional quotes. */
const readEnvFile = (file) => {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at === -1) continue;
    const key = trimmed.slice(0, at).trim();
    const raw = trimmed.slice(at + 1).trim();
    values[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
};

const fileValues = readEnvFile(envFile);
const pick = (name) => (process.env[name] ?? fileValues[name] ?? "").trim();

const clientId = pick("MYTOME_GOOGLE_CLIENT_ID");
const clientSecret = pick("MYTOME_GOOGLE_CLIENT_SECRET");

fs.mkdirSync(path.dirname(target), { recursive: true });

if (!clientId || !clientSecret) {
  // A stale file from an earlier build would silently re-enable Drive with the
  // wrong project, which is worse than having no Drive at all.
  fs.rmSync(target, { force: true });
  console.log(
    "desktop credentials: none found — this build will have no Drive feature.\n" +
      "  Set MYTOME_GOOGLE_CLIENT_ID and MYTOME_GOOGLE_CLIENT_SECRET, or put them in\n" +
      "  .env.desktop.local. See docs/google-drive-sync.md.",
  );
  process.exit(0);
}

fs.writeFileSync(target, JSON.stringify({ clientId, clientSecret }, null, 2) + "\n");
console.log(`desktop credentials: written for client ${clientId.slice(0, 12)}…`);
