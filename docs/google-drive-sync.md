# Google Drive sync — setting it up

myTome can keep one backup file per tome in a `myTome` folder in your own Google
Drive, so a second browser signed in as you picks up the same books. There is
still no server: the sync runs in the tab, talking straight to Google's API.

**Nothing here is required.** Build without a client id and the Drive card on
`/backup` stays a description of a feature the build doesn't have — no buttons,
no network calls, no Google script loaded.

## 1. Make an OAuth client

In the [Google Cloud console](https://console.cloud.google.com/):

1. **Create a project** (any name — it's yours alone).
2. **Enable the Google Drive API** for it (APIs & Services → Library → Drive
   API → Enable).
3. **Configure the OAuth consent screen**, User type *External*. Fill in the app
   name and your own email. Then **add yourself under Test users** and leave the
   app in *Testing*: for personal use that avoids the verification review
   entirely, and the only account that can sign in is one you listed.
4. **Create credentials → OAuth client ID → Web application.** Under
   **Authorized JavaScript origins** add every origin you'll run the app from:

   ```
   https://atikunea.github.io
   http://localhost:5173
   http://localhost:4173
   ```

   Origins only — no paths, no trailing slash. Leave *Authorized redirect URIs*
   empty: this flow uses a pop-up, not a redirect, which is exactly why the
   `#/…` hash router and the `/myTome/` subpath cause no trouble here.

5. Copy the **client ID**. It looks like
   `1234567890-abcdefg.apps.googleusercontent.com`.

There is no client secret in this flow. If you ever find yourself pasting one
into this repo, something has gone wrong — see *Security* below.

### About the scope

The app asks for exactly one: `drive.file`, per-file access to files it created
itself. It cannot see, list, or touch anything else in your Drive, and the
consent screen will say so. That grant belongs to the OAuth client rather than
to a browser, which is the whole trick: the file written from Chrome is one the
same client id can read from Firefox, without ever asking for read access to
your Drive at large.

Google reclassifies scopes from time to time. If the console tells you
`drive.file` now needs verification, believe the console over this file.

## 2. Give the build the client id

Locally, copy `.env.example` to `.env.local` (git-ignored) and fill it in:

```bash
cp .env.example .env.local
```

For the deployed site, set a **repository variable** named
`VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions →
*Variables*). Not a secret — an OAuth client id is public by design and ships in
the JavaScript bundle. `.github/workflows/deploy.yml` already passes it to the
build; deploys are manual (`workflow_dispatch`), so run the workflow after
setting it.

If the dev server ever starts on a port other than 5173, that origin isn't
authorized and sign-in will fail with a `redirect_uri_mismatch`-style error.
Free the port, or add the one it used to the console.

## 3. Use it

On `/backup` → **Connect Google Drive** → consent → **Sync now**. What it does:

- Lists the `myTome` folder and reads each file's `touchedAt` from Drive's
  private per-app metadata. **No manuscript is downloaded to decide anything.**
- Pulls any tome that is newer in Drive, merging it exactly as restoring a file
  by hand would.
- Pushes any tome that is newer here, re-checking the file hasn't changed since
  the listing before overwriting it.
- Does nothing at all for tomes where both sides agree.

Sync is a button, never a background loop — a local-first app has to treat "no
network" as an ordinary Tuesday, and Google's silent token renewal depends on
third-party cookies that browsers keep tightening.

### Two behaviors to know about

**Sync never deletes.** Delete a tome here and the next sync brings it back from
Drive: a listing cannot tell "deleted" from "this browser has never seen it".
To remove a book for good, delete its file in Drive too.

**Editing the same tome in two browsers can lose a session.** The newer
high-water mark wins the whole tome; there is no line-by-line merge of two
manuscripts. In practice: sync when you sit down and when you get up.

## Security

What this feature does and does not expose, plainly:

- **The access token never leaves memory.** Not `localStorage`, not IndexedDB,
  not a cookie. It expires in about an hour and there's no refresh token, so an
  XSS that grabbed it would have one session, not permanent access. This is why
  you may be asked to sign in again after leaving a tab open a long while.
- **`drive.file` and nothing else.** The app can't read your other Drive files
  even if it wanted to; a bug or a compromise can't turn into a Drive-wide leak.
- **Google's script loads only when you first press Connect**, not on page load.
  Never touch Drive and no third-party code ever runs in the app.
- **A Content-Security-Policy ships in the built page** (`vite.config.ts`),
  allowing only same-origin code plus `accounts.google.com` and
  `www.googleapis.com`. GitHub Pages serves no headers we control, so it rides
  in a `<meta>` tag; it's build-only because the dev server needs `eval` and a
  websocket for hot reload.
- **Your manuscript sits in Drive as plain JSON.** Google can read it. Files the
  app creates are private to your account unless you share them yourself — the
  app has no sharing UI and shouldn't grow one. If that isn't good enough,
  client-side encryption is the next step, with the obvious trade: forget the
  passphrase and the backup is gone.
- **Sync only ever merges.** "Replace everything" stays a deliberate act on a
  file you picked, behind a confirm. Nothing automatic is allowed to wipe a
  library.
- **Drive content is still untrusted input.** It goes through the same
  `parseBackup` validation as a file off your desktop, because "it came from
  Drive" is not the same as "it is well-formed".

To revoke access outside the app: [Google Account → Data & privacy → Third-party
apps](https://myaccount.google.com/permissions). **Disconnect** in the app does
the same thing, and forgets the token.
