import { asProseDocument, countDocumentWords, documentText } from "../lexical/blocks";
import type { Author } from "../models/Author";
import { authorByline, authorDescription } from "../models/Author";
import { backfillPlotRows, db } from "../models/db";
import type { Element } from "../models/Element";
import { elementSearchText } from "../models/Element";
import type { ElementType } from "../models/ElementType";
import type { Plot, PlotItem, PlotRow } from "../models/Plot";
import type { Relationship } from "../models/Relationship";
import type { ImageSource, Tome } from "../models/Tome";
import { tomeDescription } from "../models/Tome";
import type { WriteItem } from "../models/WriteItem";
import { slugify } from "./slug";
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
 *
 * **Author profiles are the one thing here that is not a tome's.** A byline is
 * shared by every book credited to it, so it cannot be "replaced whole" along
 * with any one of them without one book's copy reverting another's. Profiles
 * therefore ride beside the tomes in `authors` and merge **row by row, newest
 * `updatedAt` wins**, independent of what happened to any tome in the same
 * file — safe for them precisely because a profile is one self-contained row
 * with no invariant spanning other rows, unlike a beat on the spine. A
 * one-tome file carries the profile its tome credits, so a book handed to
 * another browser arrives with its byline.
 */

export const backupFormat = "myTome-backup";
/**
 * Bumped only when the shape below changes in a way an older reader can't take.
 *
 * v2 is schema v9: `Element.description` holds a Lexical document where it used
 * to hold plain text. The field kept its name, so a v1 reader would restore the
 * file without complaint and then show every element card a paragraph of JSON —
 * which is exactly what the version check is for. Reading *older* files stays
 * supported: `writeTome` converts a plain-text description on the way in.
 *
 * v3 is schema v10, and is the same bump one table over: `Tome.description` is
 * a document now, so a v2 reader would put JSON on every library card. Both
 * conversions are one-way and both stay readable — a v1 or v2 file restores
 * into v3 rows.
 *
 * Schema v11's author profiles did **not** bump it, and that is the test being
 * applied rather than skipped: `authors` and `Tome.authorId` are new fields an
 * older reader ignores, and nothing it already knows changed meaning. (An older
 * app refuses the file anyway, on `schemaVersion`.)
 */
export const backupFormatVersion = 3;

/**
 * An `ImageSource` flattened for JSON. A cover or portrait the author uploaded
 * is a `Blob`, which `JSON.stringify` turns into `{}` — so the bytes travel as
 * base64 and are rebuilt into a `Blob` on the way back in.
 */
export type SerializedImage =
  | { kind: "url"; url: string }
  | { kind: "local"; mimeType: string; data: string };

export type BackedUpTome = Omit<Tome, "coverImage" | "descriptionText"> & {
  coverImage?: SerializedImage;
  /**
   * Absent in a v1 or v2 file, where `description` was plain text and the
   * mirror did not exist. `writeTome` derives it on the way in — the tome's
   * half of the looseness described on `BackedUpElement` below.
   */
  descriptionText?: string;
};
export type BackedUpElement = Omit<
  Element,
  "image" | "descriptionText" | "searchText"
> & {
  image?: SerializedImage;
  /**
   * Absent in a v1 file, where `description` was plain text and neither mirror
   * existed. `writeTome` derives both on the way in, so this is the one place
   * the format is knowingly loose about a field the schema requires.
   */
  descriptionText?: string;
  searchText?: string;
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

export type BackedUpAuthor = Omit<Author, "image"> & { image?: SerializedImage };

export interface BackupFile {
  format: typeof backupFormat;
  formatVersion: number;
  /** The Dexie version that wrote it, so a file from the future can be refused. */
  schemaVersion: number;
  exportedAt: string;
  tomes: TomeBackup[];
  /**
   * Author profiles — every one for a whole-library file, the credited one for a
   * one-tome file, and exactly one (with no tomes) for a profile's own Drive
   * file. Absent from a file written before schema v11; `parseBackup` defaults
   * it. See the note at the top for why these merge row by row.
   */
  authors: BackedUpAuthor[];
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

export interface BackupAuthorSummary {
  id: string;
  byline: string;
  mergeAction: MergeAction;
}

export interface BackupSummary {
  exportedAt: string;
  tomes: BackupTomeSummary[];
  authors: BackupAuthorSummary[];
}

export interface RestoreCounts {
  added: number;
  replaced: number;
  kept: number;
}

/** Tome counts at the top, as before profiles existed; the profiles' own beside them. */
export interface RestoreResult extends RestoreCounts {
  authors: RestoreCounts;
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

const collectAuthor = async (author: Author): Promise<BackedUpAuthor> => ({
  ...author,
  image: await serializeImage(author.image),
});

const fileOf = (tomes: TomeBackup[], authors: BackedUpAuthor[]): BackupFile => ({
  format: backupFormat,
  formatVersion: backupFormatVersion,
  schemaVersion: db.verno,
  exportedAt: new Date().toISOString(),
  tomes,
  authors,
});

/** What merging one profile would do: the newer `updatedAt` wins, a tie keeps what is here. */
const authorMergeAction = async (entry: BackedUpAuthor): Promise<MergeAction> => {
  const here = await db.authors.get(entry.id);
  if (!here) return "add";
  return entry.updatedAt > here.updatedAt ? "replace" : "keep";
};

/**
 * One profile into the table. The bio goes through `authorDescription` so a
 * hand-edited file holding plain text — or no mirror — lands as a document the
 * editor can open, exactly as a tome's description does.
 */
const writeAuthor = (entry: BackedUpAuthor) =>
  db.authors.put({
    ...entry,
    ...authorDescription(entry.description),
    image: deserializeImage(entry.image),
  });

const writeTome = async (entry: TomeBackup) => {
  const rowIds = new Set(entry.plotRows.map((row) => row.id));
  // A pre-v3 file carries plain text and no mirror, and a restore bypasses
  // Dexie's upgrades — so the tome goes through the same helper the v10
  // backfill and every save use.
  const prose = tomeDescription(entry.tome.description);
  await db.tomes.put({
    ...entry.tome,
    ...prose,
    descriptionText: entry.tome.descriptionText ?? prose.descriptionText,
    coverImage: deserializeImage(entry.tome.coverImage),
  });
  await db.elementTypes.bulkPut(entry.elementTypes);
  // A restore bypasses Dexie's upgrades, so a pre-v9 file arrives with plain
  // text in `description` and neither mirror — derived here for the same reason
  // `wordCount` is below, and through the same helpers the v9 backfill uses so
  // a restored row and a migrated one are searchable alike.
  const fieldsByType = new Map(
    entry.elementTypes.map((type) => [type.id, type.fieldDefinitions ?? []]),
  );
  await db.elements.bulkPut(
    entry.elements.map((element) => {
      const description = asProseDocument(element.description);
      const descriptionText = element.descriptionText ?? documentText(description);
      return {
        ...element,
        description,
        descriptionText,
        searchText:
          element.searchText ??
          elementSearchText(
            { ...element, descriptionText },
            fieldsByType.get(element.elementTypeId) ?? [],
          ),
        image: deserializeImage(element.image),
      };
    }),
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
  await db.writeItems.bulkPut(
    entry.writeItems.map((item) => ({
      ...item,
      // A file written before v8 carries no count. It is the one field a
      // restore has to *derive* rather than default, and it is per-row — no
      // cross-row knowledge, unlike the spine above — so it is done here beside
      // the beat's own defaults instead of in a backfill pass afterwards.
      wordCount: item.wordCount ?? countDocumentWords(item.content ?? ""),
    })),
  );
};

export const backupStore = {
  /** Every tome in this browser, as one file. */
  async exportBackup(): Promise<BackupFile> {
    const tomes = await db.tomes.orderBy("title").toArray();
    const entries = await Promise.all(tomes.map((tome) => collectTome(tome.id)));
    const authors = await Promise.all(
      (await db.authors.orderBy("name").toArray()).map(collectAuthor),
    );
    return fileOf(
      entries.filter((entry) => entry !== undefined),
      authors,
    );
  },

  /**
   * One tome, in exactly the shape a whole-library file holds it — with the
   * profile it credits, so the book's byline travels with it.
   */
  async exportTomeBackup(tomeId: string): Promise<BackupFile> {
    const entry = await collectTome(tomeId);
    if (!entry) throw new Error("That tome is no longer in this browser.");
    const author = entry.tome.authorId
      ? await db.authors.get(entry.tome.authorId)
      : undefined;
    return fileOf([entry], author ? [await collectAuthor(author)] : []);
  },

  /**
   * One profile and no tomes: the file Drive keeps for a byline. A profile is
   * its own unit of sync — see `syncPlan.ts` — so it needs a file of its own,
   * and it is the same `BackupFile` shape rather than a second format.
   */
  async exportAuthorBackup(authorId: string): Promise<BackupFile> {
    const author = await db.authors.get(authorId);
    if (!author) throw new Error("That author is no longer in this browser.");
    return fileOf([], [await collectAuthor(author)]);
  },

  /**
   * Every profile here with the one number a sync compares. A profile is a
   * single row, so its high-water mark is simply its own `updatedAt`.
   */
  async authorMarks(): Promise<{ id: string; title: string; touchedAt: string }[]> {
    return (await db.authors.orderBy("name").toArray()).map((author) => ({
      id: author.id,
      title: authorByline(author),
      touchedAt: author.updatedAt,
    }));
  },

  /**
   * Every tome here, with the one number a sync compares — its high-water mark.
   *
   * Deliberately cheap and contents-free: this is what `syncPlan.planSync`
   * weighs against a Drive listing, so a sync that has nothing to do never reads
   * a manuscript, let alone transfers one.
   */
  async tomeMarks(): Promise<{ id: string; title: string; touchedAt: string }[]> {
    const tomes = await db.tomes.orderBy("title").toArray();
    const marks = [];
    for (const tome of tomes)
      marks.push({
        id: tome.id,
        title: tome.title,
        touchedAt: (await localTouchedAt(tome.id)) ?? tome.updatedAt,
      });
    return marks;
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
    const authors: BackupAuthorSummary[] = [];
    for (const entry of file.authors)
      authors.push({
        id: entry.id,
        byline: authorByline(entry),
        mergeAction: await authorMergeAction(entry),
      });
    return { exportedAt: file.exportedAt, tomes, authors };
  },

  /**
   * Loads the file. `replace` empties every table first; `merge` takes a tome
   * only when the file's copy is newer, and replaces it whole rather than row by
   * row — a tome is the smallest unit anyone reasons about, and half-merging one
   * could leave a beat standing on a row from the other browser.
   *
   * Profiles are the exception, merged one row at a time by their own
   * `updatedAt` whatever became of the tomes beside them — see the note at the
   * top of this file.
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
      db.authors,
    ];
    return db.transaction("rw", tables, async (tx) => {
      const result: RestoreResult = {
        added: 0,
        replaced: 0,
        kept: 0,
        authors: { added: 0, replaced: 0, kept: 0 },
      };
      if (mode === "replace") for (const table of tables) await table.clear();
      for (const entry of file.authors) {
        const action = await authorMergeAction(entry);
        if (action === "keep") result.authors.kept += 1;
        else {
          result.authors[action === "add" ? "added" : "replaced"] += 1;
          await writeAuthor(entry);
        }
      }
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
    // Absent before schema v11. A profile without the fields the merge compares
    // is dropped rather than written as a row nothing could name or date.
    authors: (Array.isArray(file.authors) ? file.authors : []).filter(
      (author) =>
        isRecord(author) &&
        typeof author.id === "string" &&
        typeof author.name === "string" &&
        typeof author.updatedAt === "string",
    ),
  };
};

/**
 * `myTome-backup-2026-08-30.json`, or `myTome-the-long-road-2026-08-30.json` for
 * a single tome — the name the download lands under.
 */
export const backupFileName = (file: BackupFile) => {
  const day = (file.exportedAt || new Date().toISOString()).slice(0, 10);
  const name =
    file.tomes.length === 1
      ? slugify(file.tomes[0].tome.title, "tome")
      : "backup";
  return `myTome-${name}-${day}.json`;
};
