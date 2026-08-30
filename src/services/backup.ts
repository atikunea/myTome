import { backfillPlotRows, db } from "../models/db";
import type { Element } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { Plot, PlotItem, PlotRow } from "../models/Plot";
import type { Relationship } from "../models/Relationship";
import type { ImageSource, Tome } from "../models/Tome";
import type { WriteItem } from "../models/WriteItem";
import { syncPlotSortOrder } from "./spine";
import { clearTome } from "./tomes";

/**
 * Backup and restore: the whole library, or one tome, as a single JSON file.
 *
 * There is no backend, so a file the author holds is the only copy of their work
 * that survives a cleared browser. This module is the format and the merge;
 * carrying the file somewhere — a download today, Google Drive later — is
 * transport and lives outside it. That split is the point: a Drive sync is a new
 * module that reads and writes the same `BackupFile`, not a second format.
 *
 * Three properties the format holds on to, because that sync will need them:
 *
 * - **A one-tome file and a whole-library file are the same shape**, differing
 *   only in how many entries `tomes` holds, so `restoreBackup` never branches on
 *   which kind it was handed.
 * - **Ids are preserved exactly.** Restoring the same file twice is a no-op
 *   rather than a way to accumulate duplicate tomes, which is what makes "merge"
 *   meaningful between two browsers rather than merely additive.
 * - **`touchedAt` is the tome's real high-water mark**, taken across every row
 *   belonging to it and not just `Tome.updatedAt` — writing prose or moving a
 *   beat never touches the tome row, so comparing tome rows alone would call a
 *   browser full of new writing "older" and quietly discard it.
 *
 * The `activities` table is deliberately left out: it has no reader and no
 * writer (see the root AGENTS.md), so its rows are not data anyone would miss.
 */

export const backupFormat = "myTome-backup";
/** Bumped only when the shape below changes in a way an older reader can't take. */
export const backupFormatVersion = 1;

/**
 * An `ImageSource` flattened for JSON. A cover or portrait the author uploaded
 * is a `Blob`, which `JSON.stringify` turns into `{}` — so the bytes travel as
 * base64 and are rebuilt into a `Blob` on the way back in.
 */
export type SerializedImage =
  | { kind: "url"; url: string }
  | { kind: "local"; mimeType: string; data: string };

export type BackedUpTome = Omit<Tome, "coverImage"> & {
  coverImage?: SerializedImage;
};
export type BackedUpElement = Omit<Element, "image"> & {
  image?: SerializedImage;
};

/** Everything belonging to one tome, across every table that holds any of it. */
export interface TomeBackup {
  tome: BackedUpTome;
  /** The newest `updatedAt` anywhere in this tome — see the note above. */
  touchedAt: string;
  elementTypes: ElementType[];
  elements: BackedUpElement[];
  relationships: Relationship[];
  plots: Plot[];
  plotRows: PlotRow[];
  plotItems: PlotItem[];
  writeItems: WriteItem[];
}

export interface BackupFile {
  format: typeof backupFormat;
  formatVersion: number;
  /** The Dexie version that wrote it, so a file from the future can be refused. */
  schemaVersion: number;
  exportedAt: string;
  tomes: TomeBackup[];
}

/**
 * `replace` wipes this browser and loads the file — a restore after loss.
 * `merge` takes each tome in the file only when it is newer than the copy here,
 * which is the rule a two-browser sync would run.
 */
export type RestoreMode = "replace" | "merge";

/** What a merge would do with one tome in the file. */
export type MergeAction = "add" | "replace" | "keep";

export interface BackupTomeSummary {
  id: string;
  title: string;
  touchedAt: string;
  elements: number;
  plots: number;
  writeItems: number;
  mergeAction: MergeAction;
}

export interface BackupSummary {
  exportedAt: string;
  tomes: BackupTomeSummary[];
}

export interface RestoreResult {
  added: number;
  replaced: number;
  kept: number;
}

const bytesToBase64 = (bytes: Uint8Array) => {
  // Chunked: spreading a whole cover image into fromCharCode blows the stack.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
};

const base64ToBytes = (data: string) => {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const serializeImage = async (
  image?: ImageSource,
): Promise<SerializedImage | undefined> => {
  if (!image) return undefined;
  if (image.kind === "url") return { kind: "url", url: image.url };
  const bytes = new Uint8Array(await image.blob.arrayBuffer());
  return {
    kind: "local",
    mimeType: image.blob.type || "application/octet-stream",
    data: bytesToBase64(bytes),
  };
};

const deserializeImage = (image?: SerializedImage): ImageSource | undefined => {
  if (!image) return undefined;
  if (image.kind === "url") return { kind: "url", url: image.url };
  return {
    kind: "local",
    blob: new Blob([base64ToBytes(image.data)], { type: image.mimeType }),
  };
};

const newest = (groups: { updatedAt: string }[][]) =>
  groups
    .flat()
    .reduce((max, row) => (row.updatedAt > max ? row.updatedAt : max), "");

/** Every row belonging to a tome, straight out of the tables. */
const readTome = async (tomeId: string) => {
  const tome = await db.tomes.get(tomeId);
  if (!tome) return undefined;
  const [
    elementTypes,
    elements,
    relationships,
    plots,
    plotRows,
    plotItems,
    writeItems,
  ] = await Promise.all([
    db.elementTypes.where("tomeId").equals(tomeId).toArray(),
    db.elements.where("tomeId").equals(tomeId).toArray(),
    db.relationships.where("tomeId").equals(tomeId).toArray(),
    db.plots.where("tomeId").equals(tomeId).toArray(),
    db.plotRows.where("tomeId").equals(tomeId).toArray(),
    db.plotItems.where("tomeId").equals(tomeId).toArray(),
    db.writeItems.where("tomeId").equals(tomeId).toArray(),
  ]);
  return {
    tome,
    elementTypes,
    elements,
    relationships,
    plots,
    plotRows,
    plotItems,
    writeItems,
  };
};

type TomeRows = NonNullable<Awaited<ReturnType<typeof readTome>>>;

const highWaterMark = (rows: TomeRows) =>
  newest([
    [rows.tome],
    rows.elementTypes,
    rows.elements,
    rows.relationships,
    rows.plots,
    rows.plotRows,
    rows.plotItems,
    rows.writeItems,
  ]);

/**
 * The local high-water mark for a tome, in the same terms as `touchedAt`.
 *
 * Deliberately reads rows *without* serializing images, unlike `collectTome`.
 * Base64-encoding a cover just to compare two dates is pure waste, and this runs
 * inside `restoreBackup`'s transaction, where awaiting a `Blob.arrayBuffer()`
 * means awaiting a non-Dexie promise — which real IndexedDB is free to treat as
 * the end of the transaction. (fake-indexeddb tolerates it, so the suite would
 * not catch the day it bites.)
 */
const localTouchedAt = async (tomeId: string) => {
  const rows = await readTome(tomeId);
  return rows && highWaterMark(rows);
};

/** One tome as it goes into a file, blobs and all. */
const collectTome = async (tomeId: string): Promise<TomeBackup | undefined> => {
  const rows = await readTome(tomeId);
  if (!rows) return undefined;
  return {
    ...rows,
    tome: { ...rows.tome, coverImage: await serializeImage(rows.tome.coverImage) },
    touchedAt: highWaterMark(rows),
    elements: await Promise.all(
      rows.elements.map(async (element) => ({
        ...element,
        image: await serializeImage(element.image),
      })),
    ),
  };
};

const fileOf = (tomes: TomeBackup[]): BackupFile => ({
  format: backupFormat,
  formatVersion: backupFormatVersion,
  schemaVersion: db.verno,
  exportedAt: new Date().toISOString(),
  tomes,
});

const writeTome = async (entry: TomeBackup) => {
  const rowIds = new Set(entry.plotRows.map((row) => row.id));
  await db.tomes.put({
    ...entry.tome,
    coverImage: deserializeImage(entry.tome.coverImage),
  });
  await db.elementTypes.bulkPut(entry.elementTypes);
  await db.elements.bulkPut(
    entry.elements.map((element) => ({
      ...element,
      image: deserializeImage(element.image),
    })),
  );
  await db.relationships.bulkPut(entry.relationships);
  await db.plots.bulkPut(entry.plots);
  await db.plotRows.bulkPut(entry.plotRows);
  await db.plotItems.bulkPut(
    entry.plotItems.map((item) => ({
      ...item,
      attachedElementIds: item.attachedElementIds ?? [],
      writeItemIds: item.writeItemIds ?? [],
      // A file written before v7 carries no row, and a damaged one may name a
      // row it did not carry. Either way the beat goes in without one and is
      // handed to the same backfill an upgrade would have run, rather than being
      // left pointing at nothing.
      plotRowId: rowIds.has(item.plotRowId) ? item.plotRowId : "",
    })),
  );
  await db.writeItems.bulkPut(entry.writeItems);
};

export const backupStore = {
  /** Every tome in this browser, as one file. */
  async exportBackup(): Promise<BackupFile> {
    const tomes = await db.tomes.orderBy("title").toArray();
    const entries = await Promise.all(tomes.map((tome) => collectTome(tome.id)));
    return fileOf(entries.filter((entry) => entry !== undefined));
  },

  /** One tome, in exactly the shape a whole-library file holds it. */
  async exportTomeBackup(tomeId: string): Promise<BackupFile> {
    const entry = await collectTome(tomeId);
    if (!entry) throw new Error("That tome is no longer in this browser.");
    return fileOf([entry]);
  },

  /**
   * What restoring this file would do, tome by tome. Read before the restore
   * dialog opens: the merge column is the only way the author can see that the
   * file they picked is older than what they already have.
   */
  async summarizeBackup(file: BackupFile): Promise<BackupSummary> {
    const tomes: BackupTomeSummary[] = [];
    for (const entry of file.tomes) {
      const here = await localTouchedAt(entry.tome.id);
      tomes.push({
        id: entry.tome.id,
        title: entry.tome.title,
        touchedAt: entry.touchedAt,
        elements: entry.elements.length,
        plots: entry.plots.length,
        writeItems: entry.writeItems.length,
        mergeAction:
          here === undefined
            ? "add"
            : entry.touchedAt > here
              ? "replace"
              : "keep",
      });
    }
    return { exportedAt: file.exportedAt, tomes };
  },

  /**
   * Loads the file. `replace` empties every table first; `merge` takes a tome
   * only when the file's copy is newer, and replaces it whole rather than row by
   * row — a tome is the smallest unit anyone reasons about, and half-merging one
   * could leave a beat standing on a row from the other browser.
   */
  async restoreBackup(
    file: BackupFile,
    mode: RestoreMode,
  ): Promise<RestoreResult> {
    const tables = [
      db.tomes,
      db.elementTypes,
      db.elements,
      db.relationships,
      db.plots,
      db.plotRows,
      db.plotItems,
      db.writeItems,
    ];
    return db.transaction("rw", tables, async (tx) => {
      const result: RestoreResult = { added: 0, replaced: 0, kept: 0 };
      if (mode === "replace") for (const table of tables) await table.clear();
      let backfill = false;
      for (const entry of file.tomes) {
        const here =
          mode === "replace" ? undefined : await localTouchedAt(entry.tome.id);
        if (here !== undefined) {
          if (entry.touchedAt <= here) {
            result.kept += 1;
            continue;
          }
          await clearTome(entry.tome.id);
          result.replaced += 1;
        } else result.added += 1;
        await writeTome(entry);
        backfill ||= entry.plotItems.some((item) => !item.plotRowId);
      }
      // A restore bypasses Dexie's upgrades, so a file written under an older
      // schema gets the same backfill the upgrade would have run — and every
      // tome that came in has its `sortOrder` cache rebuilt from row order,
      // which is the contract every plot reader is written against.
      if (backfill) await backfillPlotRows(tx);
      for (const entry of file.tomes) await syncPlotSortOrder(entry.tome.id);
      return result;
    });
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Turns the text of a chosen file into a `BackupFile`, or throws a message fit
 * to show the author. Everything the restore relies on is checked here, so the
 * restore itself can assume the shape.
 */
export const parseBackup = (text: string): BackupFile => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't readable — pick a myTome backup file.");
  }
  if (!isRecord(parsed) || parsed.format !== backupFormat)
    throw new Error("That doesn't look like a myTome backup file.");
  if (
    typeof parsed.formatVersion !== "number" ||
    parsed.formatVersion > backupFormatVersion
  )
    throw new Error(
      "That backup was made by a newer version of myTome. Update the app, then try again.",
    );
  if (typeof parsed.schemaVersion === "number" && parsed.schemaVersion > db.verno)
    throw new Error(
      "That backup holds data from a newer version of myTome. Update the app, then try again.",
    );
  if (
    !Array.isArray(parsed.tomes) ||
    parsed.tomes.some((entry) => !isRecord(entry) || !isRecord(entry.tome))
  )
    throw new Error("That backup file is incomplete and can't be restored.");
  const file = parsed as unknown as BackupFile;
  return {
    ...file,
    exportedAt: file.exportedAt ?? "",
    tomes: file.tomes.map((entry) => ({
      ...entry,
      // A hand-edited file — or one from an exporter that forgot — still sorts
      // somewhere, rather than comparing as `undefined` against a real date.
      touchedAt: entry.touchedAt || entry.tome.updatedAt || "",
      elementTypes: entry.elementTypes ?? [],
      elements: entry.elements ?? [],
      relationships: entry.relationships ?? [],
      plots: entry.plots ?? [],
      plotRows: entry.plotRows ?? [],
      plotItems: entry.plotItems ?? [],
      writeItems: entry.writeItems ?? [],
    })),
  };
};

/**
 * `myTome-backup-2026-08-30.json`, or `myTome-the-long-road-2026-08-30.json` for
 * a single tome — the name the download lands under.
 */
export const backupFileName = (file: BackupFile) => {
  const day = (file.exportedAt || new Date().toISOString()).slice(0, 10);
  const slug =
    file.tomes.length === 1
      ? file.tomes[0].tome.title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "tome"
      : "backup";
  return `myTome-${slug}-${day}.json`;
};
