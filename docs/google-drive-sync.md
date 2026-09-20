# Google Drive sync — setting it up

myTome can keep one backup file per tome — and one per author profile, plus one
for your writing goals — in a `myTome` folder in your own Google Drive, so a
second browser or machine signed in as you picks up the same books. There is
still no server: the sync talks straight to Google's API.

**Nothing here is required.** Build without credentials and the Drive card on
`/backup` stays a description of a feature the build doesn't have — no buttons,
no network calls, no Google code loaded.

## Two builds, two clients

The web app and the desktop app need **separate OAuth clients**, because they
sign in in fundamentally different ways.

| | Web app | Desktop app |
|---|---|---|
| Client type in the console | **Web application** | **Desktop app** |
| How sign-in happens | A pop-up, in the page | The system browser, redirecting to `127.0.0.1` |
| What you register | Authorized JavaScript origins | Nothing — loopback needs no registration |
| Client secret | None, ever | Yes (and it is not confidential — see below) |
| Refresh token | No. Tokens last about an hour | **Yes.** This is why the desktop build exists |
| Credentials go in | `VITE_GOOGLE_CLIENT_ID` | `MYTOME_GOOGLE_CLIENT_ID` + `_SECRET` |

You can set up one and not the other. A build with no credentials simply has no
Drive feature.

## 1. The project, once

In the [Google Cloud console](https://console.cloud.google.com/):

1. **Create a project** — any name, it's yours alone.
2. **Enable the Google Drive API** (APIs & Services → Library → Drive API →
   Enable).
3. **Configure the OAuth consent screen**, User type *External*. Fill in the app
   name and your own email.

### The scope

The app asks for exactly one: `drive.file`, per-file access to files it created
itself. It cannot see, list, or touch anything else in your Drive, and the
consent screen says so. That grant belongs to the OAuth client rather than to a
browser, which is the whole trick: the file written from Chrome is one the same
client id can read from Firefox, without ever asking for read access to your
Drive at large.

It is also what lets the desktop build name the signed-in account — Drive's own
`about` endpoint accepts `drive.file`, so no identity scope is needed for that.

### Testing or Production — and why it matters more for desktop

The consent screen has a publishing status, and the honest answer differs by
build.

**For the web client, *Testing* is fine.** Add yourself under Test users and
leave it there. That avoids the verification review entirely, and the only
account that can sign in is one you listed. The web flow has no refresh token,
so nothing expires early that wasn't already expiring hourly.

**For the desktop client, *Testing* breaks the feature.** A refresh token issued
by an app in Testing **expires after seven days**. An app that makes you
reconnect every week is precisely the problem the desktop build exists to solve,
so:

> **Publish the consent screen to Production before relying on desktop sync.**

Publishing does not mean submitting for review when an app requests only
non-sensitive scopes, and `drive.file` is one — that per-file grant is exactly
why the app asks for it. You will still see an "unverified app" interstitial when
signing in; click through it.

**While you are still building the app, staying in Testing is a fair trade** —
it keeps the console simple, and reconnecting once a week during development
costs nothing. Expect the card on `/backup` to turn to **Sign in again** roughly
every seven days. That is the same `needs-reconnect` state a revoked grant
produces, it is handled the same way, and **nothing is lost**: the stored token
is dropped, your library is untouched, and signing in again resumes syncing.

If you see that state on a schedule rather than after some deliberate change to
your Google account, the publishing status is the reason — not the vault, and
not the refresh logic.

Google reclassifies scopes and changes these rules from time to time. If the
console tells you something different from this file, believe the console.

## 2. The web client

**Create credentials → OAuth client ID → Web application.** Under **Authorized
JavaScript origins** add every origin you'll run the app from:

```
https://atikunea.github.io
http://localhost:5173
http://localhost:4173
```

Origins only — no paths, no trailing slash. Leave *Authorized redirect URIs*
empty: this flow uses a pop-up, not a redirect, which is exactly why the `#/…`
hash router and the `/myTome/` subpath cause no trouble.

Copy the **client ID**. It looks like
`1234567890-abcdefg.apps.googleusercontent.com`.

**There is no client secret in this flow.** If you find yourself pasting one for
the *web* client, something has gone wrong.

### Where the web client ID goes

**Locally**, copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

```
VITE_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
```

`.env.local` is git-ignored (`*.local` in `.gitignore`). Restart the dev server;
Vite only reads env files at startup.

**For the deployed site**, set a **repository variable** named
`VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions →
*Variables*). A *variable*, not a secret: an OAuth client id is public by design
and ships in the JavaScript bundle. `.github/workflows/deploy.yml` already passes
it to the build, and deploys are manual (`workflow_dispatch`), so run the
workflow after setting it.

If the dev server starts on a port other than 5173, that origin isn't authorized
and sign-in fails. Free the port, or add the one it used to the console.

## 3. The desktop client

**Create credentials → OAuth client ID → Desktop app.** Give it a name and
create it.

**There is nothing to register.** No redirect URIs, no origins. The app binds
`127.0.0.1` on a random free port and tells Google that address at sign-in time;
Google accepts any port on the loopback address for a desktop client. That
listener is the only socket myTome ever opens, it answers one path, and it is
closed the moment the redirect arrives.

Copy both the **client ID** and the **client secret**.

### About that client secret

It is not confidential, and the app does not pretend otherwise.

RFC 8252 §8.5 is explicit that a credential shipped inside an installed
application cannot be kept secret — anyone can extract it from the binary. What
actually protects the exchange is **PKCE**: a random verifier generated per
sign-in, never leaving the process, without which an intercepted authorization
code is useless.

The scope is what makes this acceptable. An extracted credential grants nothing
on its own: an attacker still needs your consent, and would still reach only
files this app created.

**It still never goes in the repo.** `AGENTS.md`'s rule that the repository
never gains a secret stays literally true — these are build inputs, not files.

### Where the desktop credentials go

Copy `.env.desktop.example` to `.env.desktop.local` and fill both values in:

```bash
cp .env.desktop.example .env.desktop.local
```

```
MYTOME_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
MYTOME_GOOGLE_CLIENT_SECRET=GOCSPX-...
```

`.env.desktop.local` is git-ignored (`*.local`). That one file covers both a
development run and a packaged build:

- **Running from source**, the main process reads it at startup.
- **Packaging**, `npm run desktop:build` writes the values into
  `dist-electron/credentials.json`, which ships inside the app — because
  environment variables on your build machine plainly do not reach an author's
  installed copy. `dist-electron/` is git-ignored too.

An environment variable of the same name overrides the file, which is how CI
would build against a different project:

```powershell
$env:MYTOME_GOOGLE_CLIENT_ID = "..."
$env:MYTOME_GOOGLE_CLIENT_SECRET = "..."
npm run desktop:package
```

Without either source, the build says so and carries on:

```
desktop credentials: none found — this build will have no Drive feature.
```

`configured` is then false, the preload exposes no Drive bridge at all, and the
card on `/backup` reads as "not set up in this build" — the same as the web app
without a client id. A stale `credentials.json` from an earlier build is deleted
rather than left to re-enable Drive against the wrong project.

## 4. Use it

On `/backup` → **Connect Google Drive** → consent → **Sync now**. What it does:

- Lists the `myTome` folder and reads each file's `touchedAt` from Drive's
  private per-app metadata. **No manuscript is downloaded to decide anything.**
- Pulls any tome that is newer in Drive, merging it exactly as restoring a file
  by hand would.
- Pushes any tome that is newer here, re-checking the file hasn't changed since
  the listing before overwriting it.
- Does nothing at all for tomes where both sides agree.

Sync is a button, never a background loop — a local-first app has to treat "no
network" as an ordinary Tuesday.

### Two behaviors to know about

**Sync never deletes.** Delete a tome here and the next sync brings it back from
Drive: a listing cannot tell "deleted" from "this browser has never seen it". To
remove a book for good, delete its file in Drive too.

**Editing the same tome in two places can lose a session.** The newer high-water
mark wins the whole tome; there is no line-by-line merge of two manuscripts. In
practice: sync when you sit down and when you get up.

## Security

What this feature does and does not expose, plainly.

**Shared by both builds:**

- **`drive.file` and nothing else.** The app can't read your other Drive files
  even if it wanted to; a bug or a compromise can't become a Drive-wide leak.
- **Sync only ever merges.** "Replace everything" stays a deliberate act on a
  file you picked, behind a confirm. Nothing automatic is allowed to wipe a
  library.
- **Drive content is still untrusted input.** It goes through the same
  `parseBackup` validation as a file off your desktop, because "it came from
  Drive" is not the same as "it is well-formed".
- **Your manuscript sits in Drive as plain JSON.** Google can read it. Files the
  app creates are private to your account unless you share them yourself — the
  app has no sharing UI and shouldn't grow one. If that isn't good enough,
  client-side encryption is the next step, with the obvious trade: forget the
  passphrase and the backup is gone.

**Web build:**

- **The access token never leaves memory.** Not `localStorage`, not IndexedDB,
  not a cookie. It expires in about an hour and there is no refresh token, so an
  XSS that grabbed it would have one session rather than permanent access. This
  is why you may be asked to sign in again after leaving a tab open a long while.
- **Google's script loads only when you first press Connect**, not on page load.
  Never touch Drive and no third-party code ever runs in the app.
- **A Content-Security-Policy ships in the built page** (`vite.config.ts`),
  allowing only same-origin code plus `accounts.google.com` and
  `www.googleapis.com`.

**Desktop build:**

- **The renderer never holds a token at all.** Every Drive call is made by the
  main process; the page asks and receives a response. An XSS in the app can ask
  for a Drive call while it runs, but has nothing to carry away — which is
  strictly better than the web build.
- **The refresh token is encrypted by the operating system** — DPAPI on Windows,
  Keychain on macOS, libsecret on Linux — and if no usable credential store
  exists, it is **not written at all**. The app asks you to sign in again each
  launch and says why, rather than leaving a bearer credential in the clear.
- **Sign-in happens in your real browser**, never in a window the app draws, so
  you can see the address bar. Google refuses embedded webviews for this reason.
- **The desktop CSP keeps `connect-src 'self'`**, because that renderer never
  talks to Google.

To revoke access outside the app: [Google Account → Data & privacy → Third-party
apps](https://myaccount.google.com/permissions). **Disconnect** in the app does
the same thing, and clears the stored token.
