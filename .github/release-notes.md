## Installing

**Windows only so far.** macOS and Linux are planned.

- **`myTome Setup VERSION.exe`** — the installer. Per-user, so it never asks
  for an administrator, and you choose the directory. Uninstalling does **not**
  delete your library.
- **`myTome-VERSION-portable.exe`** — no install at all. Runs from wherever you
  put it, and shares the same library as an installed copy.

There is no automatic updating yet. Check back here for new versions.

## These builds are not signed

Windows SmartScreen will show a blue "Windows protected your PC" warning. That
is what an unsigned application looks like; it is not a statement about this
one. "More info" → "Run anyway" gets past it.

Signing costs money and is on the roadmap. Until then: if you did not get this
file from this repository's own releases page, don't run it.

## Your work

The desktop app keeps its **own** library, separate from the web app's —
installing it does not import what you wrote in a browser. Move work between
them with a backup file or Google Drive sync, both on the Backup page.

Nothing is encrypted. Your library is as private as any other document in your
account on that machine, and no more.

## Google Drive sync

Optional, and off until you connect it. The OAuth app is currently in Google's
**Testing** status, which means two things: you will see an "unverified app"
screen when you connect, and a connection stops working after seven days and
has to be made again.
