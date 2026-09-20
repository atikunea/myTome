import { useEffect } from "react";
import { autoExportSupported, runAutoExport } from "../services/autoExport";

/**
 * Starts the automatic backup export schedule, once, for the whole app.
 *
 * Mounted in `App.tsx` rather than on `/backup`, because the point of it is
 * that it happens while the author is writing — a timer that only ran on the
 * backup page would be a timer that never ran.
 *
 * **The decision is not here.** `runAutoExport` asks `nextAutoExport` whether
 * a write is due; this hook only asks the question on a rhythm. That is why
 * the tick is a fixed five minutes rather than the author's chosen interval:
 * five is the shortest interval the settings allow, so a tick can never be the
 * thing that delays an export, and the schedule needs no rebuilding when the
 * interval changes.
 *
 * A tick costs three high-water-mark queries and usually stops there. It only
 * reads a manuscript when it is actually about to write one.
 */
const TICK_MS = 5 * 60_000;

export function useAutoExport() {
  useEffect(() => {
    if (!autoExportSupported) return;

    // A rejection is already recorded on the module, where `AutoExportCard`
    // reads it, and a failure deliberately pauses the schedule rather than
    // retrying — so there is nothing to do here but not become an unhandled
    // rejection.
    const tick = () => void runAutoExport().catch(() => {});

    // On launch, before the interval. `StrictMode` runs this twice in dev; the
    // second run finds the first one's mark already written and decides to
    // wait, which is the same guard a real second window would need.
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, []);
}
