# Activity Tracker — design notes

**Status: built.** Every decision below is implemented and verified in the
browser. The rejected options are kept with their reasons, so a later reader can
tell what was considered from what was overlooked.

Three things landed differently from the plan, each noted in its section:
creating a blank draft records **nothing** (there is no difference to record, and
a sitting opened by a click that typed nothing would be a lie); deleting a text
may join an open sitting but never starts one; and the calendar's weekday labels
and key sit outside its scroller, because the strip opens scrolled to today.

Mockups: the design canvas published alongside this doc —
<https://claude.ai/artifact/4WDT8kwtzD44RaSkr9WpLu> — carries the three
directions drawn in the app's own palette, plus the dashboard card and the
library page.

**What it is for:** an author sets a daily word goal, a length for the book and
a date to finish by, and the app tells them — from the prose they were already
writing — whether they are on course. No stopwatch to remember to press, no
second place to type numbers in.

**Where it lives now:**

| Piece | File |
| --- | --- |
| The three tables and every write to them | `services/activity.ts` |
| Streaks, pace, the session-continuation rule | `services/activityStats.ts` (pure, not on `store`) |
| Recording a word change | `services/writeItems.ts` (changed — same transaction) |
| Schema v12 | `models/db.ts` |
| The tome page and its targets dialog | `pages/ActivityPage.tsx`, `components/TomeTargetsDialog.tsx` |
| The shelf-wide page and the daily-goal dialog | `pages/LibraryActivityPage.tsx`, `components/WritingGoalsDialog.tsx` |
| The calendar, the stat tile, the dashboard summary | `components/ActivityCalendar.tsx`, `ActivityStat.tsx`, `ActivityCard.tsx` |
| Tests | `services/__tests__/activityStats.test.ts`, `activity.test.ts` |

---

## Part 1 — What counts as a word written

The tracker never counts words. `WriteItem.wordCount` is already recomputed on
every save; the tracker watches it change and records the difference.

### Decision: a day's figure is the net change across the tome

Every save that moves a text's `wordCount` contributes its delta to that day's
row. A day of heavy revision can land at zero or below, and the page shows the
negative number rather than hiding it. That is the honest reading of "how much
longer is this book than it was this morning", and it is the only reading that
keeps the day's figure equal to the book's actual change.

Rejected: **additions only**, ignoring deletions. Goals always feel achievable,
but a day of cutting 2,000 words and adding 300 reads as +300, and moving a
scene between two texts double-counts as a gain.

Rejected: **storing both and showing the split** as the headline. Two integers
are stored — `added` and `removed`, which cost nothing in a transaction that is
already open — but the UI shows net alone. Storing them is what lets a later
version explain a negative day without a schema change.

### Settled counting details

- **Deleting a text records its whole word count as a removal.** The
  alternative makes the day's figure stop agreeing with the book, which is the
  one property that makes the number trustworthy. Recovering the words is a
  restore from backup, not a correction here.
- **Only prose rows count.** Element descriptions, tome descriptions and author
  bios are Lexical documents too, but only `writeItems` carries a `wordCount`,
  and only prose rows are the manuscript. Worldbuilding notes do not move a
  manuscript goal.
- **A day is a local calendar date, stamped at write time** (`YYYY-MM-DD`,
  stored on the row). Never derive the day from an ISO timestamp at read time:
  an author who flies to Tokyo would rewrite six months of history on arrival.
- **A day with no row is a day with net 0.** Absence and zero are the same fact
  here, and no row is written for a day nobody wrote in.

### Worked example — one real day

| What happened | Delta |
| --- | --- |
| Chapter 4 — rewrote the market scene | −1,420 |
| Chapter 4 — new ending to the scene | +1,110 |
| Snippet: "the ferryman's price" | +260 |
| Deleted an abandoned passage | −260 |
| **Stored:** added 1,370 · removed 1,680 · **net** | **−310** |

The day reads −310 and does not count toward the streak, because the book did
not get longer.

---

## Part 2 — Sessions open on a save and close by arithmetic

### Decision: automatic, idle-closed, with no timer anywhere

Every session row carries `lastSaveAt`. When a save arrives, the store reads the
tome's most recent session and applies one rule:

```
continueOrStart(session, at)            // pure, in services/activityStats.ts
  session && at − session.lastSaveAt <= IDLE_MS   → extend it
  otherwise                                       → start a new one

IDLE_MS = 10 minutes
elapsed(session) = session.lastSaveAt − session.startedAt
```

**Closing lazily is what makes closing correct.** A tab shut mid-sentence leaves
a session whose last save is its end — exactly right, and arrived at without an
`unload` handler, a heartbeat, or a timer that a throttled background tab would
never fire.

Rejected: **an explicit sprint timer** (Start / Stop, optionally with a
25-minute target). Precise and deliberate, but nothing is recorded when the
author forgets to press it, which is most of the time. Rejected too as an
*addition* on top of automatic sessions, for v1 only: it is the larger surface
and nothing else depends on it.

### Settled session details

- **Elapsed is time between the first and last save, and the UI says so.**
  Thinking time before the first keystroke and the last ten minutes of staring
  are not in it. The label is "writing time", not "time at the desk" — a claim
  the data can support.
- **Autosave fires at a 600 ms pause**, so a sitting is dense in saves: an hour
  is a few hundred `update` calls on one row, inside the transaction that was
  already happening. That is the whole cost of the feature.
- **Sessions belong to a tome.** Switching books starts a new one, because a
  session's words have to land in one book's day row. Two books in one sitting
  is two sessions, and the library page adds them.

---

## Part 3 — Four targets, two scopes

A **goal** recurs. A **target** is a number you arrive at once.

| Setting | Scope | Stored on | Why there |
| --- | --- | --- | --- |
| Daily word goal | Library | `writingGoals` singleton | One habit, one streak. A per-tome streak would break every time the author worked on the other book, which punishes exactly the wrong thing. |
| Days that count | Library | `writingGoals` singleton | Travels with the goal it qualifies. A Sunday off is not a broken streak. |
| Session target (words / minutes) | Library | `writingGoals` singleton | A sitting is a sitting whichever book it is in. |
| Tome word target | Tome | `Tome.wordTarget?` | A book's length is a property of the book. Optional field; `undefined` reads as "no target". |
| Deadline | Tome | `Tome.deadline?` | Same. Pace is *derived* from these two and the current total, never stored — a stored pace is wrong the moment a word is written. |

### Derived, never stored

```
remaining    = wordTarget − currentTotal
daysLeft     = counted days between today and deadline, inclusive
requiredPace = ceil(remaining / daysLeft)           // words per counted day
projectedEnd = today + ceil(remaining / dailyGoal) counted days
standing     = requiredPace <= dailyGoal ? "ahead" : "behind"
```

Every one of these is a pure function of `(days, goals, tome, today)` in
`services/activityStats.ts`, which is where the suite for this feature lives.

### The streak rule, written down once

- **A counted day is met when its net ≥ the daily goal.** Uncounted days
  (weekends, if the author chose weekdays) are skipped entirely — they neither
  extend nor break a streak, and words written on them still show on the chart.
- **Today never breaks a streak.** Until the day ends it is "in play": the
  streak reads as the run of met counted days *before* today, and today shows
  its own progress. A streak that collapses at 09:00 because the author has not
  started yet is a bug that reads as a feature.

---

## Part 4 — Data model: schema v12

Two new tome-owned tables, one library-level singleton, two optional fields on
`Tome`, and the removal of a table that has never had a reader.

```ts
this.version(12)
  .stores({
    // One row per tome per local date. Written on every autosave, so it
    // carries exactly the indexes it is read by and no more: [tomeId+date]
    // for one book's page, `date` for the library-wide range.
    writingDays: "id, tomeId, [tomeId+date], date",
    // A sitting. `lastSaveAt` is both its end and the value the continuation
    // rule tests — see services/activityStats.ts.
    writingSessions: "id, tomeId, [tomeId+startedAt], date",
    // A singleton (id = "library"), like a settings row: the daily goal,
    // which days count, and the session target.
    writingGoals: "id",
    // Dropped. No writer, no reader, no rows anywhere — AGENTS.md has called
    // it vestigial since it was written. Removing it now keeps `Activity`
    // from colliding with the feature actually named that.
    activities: null,
  });
  // No .upgrade(): every table is new, and `Tome.wordTarget` / `Tome.deadline`
  // are optional fields for which `undefined` is the right reading — rule 2.
```

```ts
interface WritingDay {
  id: string;            // uuid, like every other row
  tomeId: string;
  date: string;          // "2026-09-18", local
  added: number;         // gross, >= 0
  removed: number;       // gross, >= 0
  net: number;           // added − removed
  sessions: number;
  minutes: number;       // summed writing time
  createdAt: string;
  updatedAt: string;
}

interface WritingSession {
  id: string;
  tomeId: string;
  date: string;          // the day it started in
  startedAt: string;     // ISO
  lastSaveAt: string;    // ISO — its end
  added: number;
  removed: number;
  net: number;
  saves: number;
}

interface WritingGoals {
  id: "library";         // the only fixed id in the app; it is a settings row
  dailyWords: number;    // 0 = no daily goal
  countedDays: number[]; // 0–6, Sunday-based
  sessionWords?: number;
  sessionMinutes?: number;
  updatedAt: string;     // merged newest-wins, exactly like an author profile
}
```

**Goals go in Dexie rather than `localStorage`** because a goal is *authored*:
it belongs in the backup file and on the other machine after a Drive sync.
Colour mode and the prose face are device preferences; a 90,000-word target is
not.

### Where the recording hooks in

`saveWriteItem`, `createDraftWriteItem` and `deleteWriteItem` call
`recordWordChange(tomeId, before, after, at)` **inside their existing
transaction**, which grows to list `writingDays` and `writingSessions`. If the
word count is written and the activity is not, the tracker is lying by exactly
the amount of the crash. `recordWordChange` is never called from a page and
never outside the caller's `db.transaction("rw", …)`.

---

## Part 5 — Routes

Targets are edited in a dialog, so the dialog is a route: back, refresh and a
deep link all work, and a page can link straight at "set a deadline".

```
/tomes/:tomeId/activity            <ActivityPage />
/tomes/:tomeId/activity/targets    <ActivityPage editing />        // tome target + deadline
/activity                          <LibraryActivityPage />
/activity/goals                    <LibraryActivityPage editing /> // daily goal, counted days, session target
```

Same page, boolean prop — the `/tomes/new` pattern. The library page sits beside
`/backup` and `/authors` because the daily goal spans the shelf; the tome page
sits inside `WorkspaceLayout` with a nav entry under Write.

---

## Part 6 — Backup and sync

- **`backupFormatVersion` stays at 3.** Three new tables are three added fields
  on the file. An older reader ignores them and misreads nothing it already
  knows, which is the only thing that justifies a bump.
- **Days and sessions are tome-owned and join `touchedAt`.** A tome is replaced
  whole on merge, so its activity arrives whole with it. Writing already bumps
  the text's `updatedAt`, so this changes which copy wins in no case.
- **Goals merge row by row, newest `updatedAt` wins** — the author-profile rule,
  in their own Drive file. Two machines that each changed the goal resolve to
  the later edit, not to whichever synced last.
- **A restore lands these rows verbatim.** Unlike `wordCount`, a day's net is
  not derivable from anything else in the file. Restoring the same file twice
  stays a no-op because ids are preserved.

---

## Part 7 — The three directions, and what to build

Drawn in full on the canvas linked at the top.

- **A · The Ledger** — today against the goal, then the last fortnight as bars,
  then a table of days and a log of sittings. Cheapest to build and the only one
  that needs no visual vocabulary the app does not already have: the day table
  is `WriteListPage`'s pattern with different columns.
- **B · The Year** — a calendar of every day since the book began, one square
  each. The strongest read at a glance and the most likely to be opened daily.
  Needs a sequential ramp the app does not own yet, and a screen-reader path the
  squares alone do not provide.
- **C · The Deadline** — projection, required pace and slack, over a cumulative
  chart. The only direction that answers a question rather than reporting
  numbers, and the only one that is useless without a deadline.

**Decision: A's structure with B's calendar as its top panel.** They compose —
the calendar replaces A's 14-day bars, and the day table below it is the
accessible reading of the same data rather than a duplicate. **C folds into the
tome page's header**: its three figures become one strip, shown only when the
tome has a deadline. The cumulative chart is deferred — it is the most work here
and says little that "51 days of slack" does not.

The **dashboard card** ships last: smallest surface, and the only one with a
real empty state to design. It is read-only, links through, and is hidden
entirely when no goal and no target are set rather than showing zeroes. The
**library page** shows one goal, one streak and every book, with per-book rows
as the breakdown and never as separate goals.

---

## Constraints that do not move

- **No backend.** Everything is Dexie. There is no service worker, so there are
  no reminders and no notifications: the app cannot know you did not write today
  until you open it.
- **`models/db.ts` is imported only by `src/services/`.** The two pages and the
  card call `store`.
- **Reads are live queries** through `observe` / `useObservable`; mutations are
  plain `save*` / `delete*`. No optimistic copies.
- **Ids are `crypto.randomUUID()`** and timestamps are ISO strings — except the
  `writingGoals` singleton, whose id is `"library"` because there is exactly one
  of it.
- **Validation sits outside the mutation**, as it does for every other entity: a
  goal of −500 words is rejected by the form, not by the store.
- **MUI only.** No `.css` files, no hardcoded hex, no hand-written inline `<svg>`
  icons — the calendar squares are styled MUI boxes, not an SVG grid.
- **Don't index what is filtered in memory.** `writingDays` is written on every
  autosave; its three indexes are the ones it is read by and no more.

## Things that go stale silently

Each is wrong the moment this ships, and nothing fails a build over it.

- **`pages/PrivacyPolicyPage.tsx`** — its storage list mirrors `models/db.ts`
  and currently ends "…plots, plot rows, beats and prose — in the browser's
  IndexedDB". Three new tables make that incomplete; the page's "Last updated"
  line moves in the same commit.
- **`AGENTS.md`** — the eight-table cascade becomes ten; `activities` leaves the
  "two vestigial things" section, which becomes one thing; `services/` gains two
  modules in its listing; the schema line moves from version 11 to 12.
- **`src/components/AGENTS.md`** — `WriteListPage` is described as "the app's
  only table". With the day table it is not.

## Tests the `node` suite can actually reach

- `activityStats.test.ts` — pure: the continuation rule at either side of
  `IDLE_MS`, streaks across uncounted days, today-in-play, pace and projection,
  and a day boundary at local midnight.
- `activity.test.ts` — `fake-indexeddb`: a save records, a delete records its
  whole count, the tome cascade clears both tables, a session extends and then
  splits.
- A **v12 migration test** built on an older database, per the AGENTS.md recipe,
  and a **backup round-trip** asserting days, sessions and goals survive it.
- Set `updatedAt` explicitly anywhere order is asserted.

## What this deliberately does not do

- **No live counter while writing.** The focus surface was ruled out, and that
  has a consequence worth naming: the session target is only evaluated *after*
  the sitting, in the log. If hitting 500 words in a sitting should feel like
  anything while it is happening, that is a live strip — and the constraint
  there is real, since nothing in the focus surface may change size as prose
  swaps between its static and live renders.
- **No retroactive correction.** A day's row is what happened. There is no
  "I wrote 2,000 words in a notebook" entry and no editing yesterday; that would
  make every number in the feature a claim rather than a measurement.
- **No time-at-desk.** Writing time is first save to last save.
- **Words are counted, not judged.** Pasting 5,000 words in is a 5,000-word day.
  The tracker measures the manuscript, and the manuscript got longer.

---

## Decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-09-18 | **Net change per day**, with `added` and `removed` both stored and only net shown. | Net is the only figure that keeps agreeing with the book's actual length; storing the split costs nothing and leaves the door open. |
| 2026-09-18 | **Deleting a text counts against the day.** | Same reason; the alternative silently decouples the day's figure from the manuscript. |
| 2026-09-18 | **Only `writeItems` count.** | They are the only rows with a `wordCount`, and the only rows that are the manuscript. |
| 2026-09-18 | **Automatic, idle-closed sessions; no timer, no `unload` handler.** | A session closed by arithmetic survives a tab killed mid-sentence and a throttled background tab; an explicit sprint records nothing on the days the author forgets it. |
| 2026-09-18 | **Elapsed is first save to last save**, labelled "writing time". | It is the only claim the data supports. |
| 2026-09-18 | **Daily goal and session target are library-wide; word target and deadline are per tome.** | One habit, one streak: a per-tome streak breaks every time the author switches books. A book's length belongs to the book. |
| 2026-09-18 | **Goals live in Dexie, not `localStorage`.** | A goal is authored data — it belongs in the backup and on the other machine. Colour mode is a device preference; a target is not. |
| 2026-09-18 | **Schema v12 with no `.upgrade()`**, and `activities` dropped in the same version. | Every table is new and both `Tome` fields are optional (rule 2). The dead table would otherwise collide with the feature's own naming. |
| 2026-09-18 | **Recording happens inside `writeItems`' existing transaction.** | If the count commits and the activity does not, the tracker lies by exactly the size of the crash. |
| 2026-09-18 | **`backupFormatVersion` stays at 3.** | Added tables; an older reader ignores them and misreads nothing it knows. |
| 2026-09-18 | **Targets dialogs are routes** (`activity/targets`, `activity/goals`). | The URL can rebuild them, which is the test. |
| 2026-09-18 | **Ledger structure + calendar panel; pace as a header strip; cumulative chart deferred.** | The calendar is what gets opened daily, the table is its accessible reading, and "51 days of slack" says what the chart would. |
| 2026-09-18 | **No live counter in the focus surface** in v1. | Ruled out with the placement; a strip there must not change size as sections swap, which is the hardest constraint in the app. |
| 2026-09-18 | **Creating a blank draft records nothing**, and a delete joins an open sitting but never starts one. | A fresh draft holds no words, so there is no difference to record and no sitting to open; clearing out the Write list is not writing, but the book still got shorter. |
| 2026-09-18 | **The calendar opens scrolled to today**, with its weekday labels and key outside the scroller. | A year of weeks is wider than the workspace and the week that matters is the last one — labels that slid off with last autumn would never be seen again. |
