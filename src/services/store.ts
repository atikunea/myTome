import { backupStore } from "./backup";
import { elementStore } from "./elements";
import { elementTypeStore } from "./elementTypes";
import { plotStore } from "./plots";
import { spineStore } from "./spine";
import { templateStore } from "./templates";
import { tomeStore } from "./tomes";
import { writeItemStore } from "./writeItems";

/**
 * The single data-access surface the app talks to. Pages, components and
 * contexts import `store` from here and never reach for `db` — the Dexie schema
 * is imported only by files in `src/services/`, which is what keeps the
 * migration rules in AGENTS.md tractable.
 *
 * The domain modules behind this barrel are split by table, with one deliberate
 * exception: `spine.ts` owns every write to a row's rank or to a beat's
 * `plotRowId`, so the rule that `PlotItem.sortOrder` is a cache of row order has
 * a module boundary and not just a comment. See `services/spine.ts`.
 *
 * Two kinds of member, used differently:
 *
 * - `observe*` wraps Dexie `liveQuery` and returns a `Subscription`. Never
 *   subscribe by hand in a `useEffect` — pass these to `useObservable`.
 * - `save*` / `delete*` / `apply*` are plain async mutations. Every read is a
 *   live query, so a mutation needs no manual refresh and no optimistic copy.
 *
 * Validation is *not* inside the mutations — see `services/validate.ts`.
 */
export const store = {
  ...tomeStore,
  ...templateStore,
  ...elementTypeStore,
  ...elementStore,
  ...plotStore,
  ...spineStore,
  ...writeItemStore,
  ...backupStore,
};

// `parseBackup` and `backupFileName` sit beside the validators rather than on
// `store` for the same reason those do: they are pure functions a caller runs
// before a mutation, not reads or writes of their own.
export { backupFileName, parseBackup } from "./backup";
export type {
  BackupFile,
  BackupSummary,
  BackupTomeSummary,
  MergeAction,
  RestoreMode,
  RestoreResult,
} from "./backup";
export { imageFrom, imageUrl } from "./images";
// Not a member of `store` for the same reason: it asks the *browser* to keep
// the database durably and touches no table of ours. See `services/storage.ts`
// for why the ask is deferred until a library has something in it.
export { requestPersistentStorage } from "./storage";
export {
  validateElement,
  validateFields,
  validatePlotItem,
  validateRelationship,
} from "./validate";
