import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import type { PlotItem } from "../../models/Plot";
import type { WriteItem } from "../../models/WriteItem";
import { isProseDocument } from "../../lexical/blocks";
import { backupFileName, parseBackup, store } from "../store";
import type { BackupFile } from "../store";
import { addBeat, beatsOf, expectSpineIntact, makeTome } from "./helpers";

/**
 * A tome with something in every table a backup carries: two element types'
 * worth of people, a relationship between them, two plots of beats, and prose
 * composed into one of those beats.
 */
const fullTome = async (title: string) => {
  const { tome, plots } = await makeTome(["Main", "Side"]);
  const author = await store.createDraftAuthor();
  await store.updateAuthor(author.id, { name: `Author of ${title}`, pseudonym: "A. Pen" });
  await store.saveTome({ ...tome, title, authorId: author.id });
  const type = await store.saveType({
    tomeId: tome.id,
    name: "Character",
    fieldDefinitions: [
      { id: "age", name: "Age", kind: "text", required: false, sortOrder: 0 },
    ],
  });
  const ash = await store.saveElement({
    tomeId: tome.id,
    elementTypeId: type.id,
    name: "Ash",
    description: "",
    attributes: { age: "31" },
  });
  const bel = await store.saveElement({
    tomeId: tome.id,
    elementTypeId: type.id,
    name: "Bel",
    description: "",
    attributes: { age: "44" },
  });
  await store.saveElementRelationships(ash, [
    { otherElementId: bel.id, otherElementTypeId: type.id, label: "rival" },
  ]);
  const write = await store.createDraftWriteItem(tome.id, "passage");
  const beat = await addBeat(tome.id, plots[0].id, "the duel");
  await addBeat(tome.id, plots[1].id, "meanwhile");
  await store.savePlotItem({
    ...beat,
    attachedElementIds: [ash.id, bel.id],
    writeItemIds: [write.id],
  });
  return {
    tome: (await db.tomes.get(tome.id))!,
    author: (await db.authors.get(author.id))!,
    plots,
    type,
    ash,
    bel,
    write,
  };
};

/** Every row in the database, table by table, for whole-database comparisons. */
const snapshot = async () => ({
  tomes: await db.tomes.orderBy("id").toArray(),
  elementTypes: await db.elementTypes.orderBy("id").toArray(),
  elements: await db.elements.orderBy("id").toArray(),
  relationships: await db.relationships.orderBy("id").toArray(),
  plots: await db.plots.orderBy("id").toArray(),
  plotRows: await db.plotRows.orderBy("id").toArray(),
  plotItems: await db.plotItems.orderBy("id").toArray(),
  writeItems: await db.writeItems.orderBy("id").toArray(),
  authors: await db.authors.orderBy("id").toArray(),
});

/** A file as it comes back off disk: everything a JSON round trip would drop. */
const throughJson = (file: BackupFile) => parseBackup(JSON.stringify(file));

describe("export and restore", () => {
  it("restores a whole library byte for byte after everything is lost", async () => {
    await fullTome("The Long Road");
    await fullTome("Second Book");
    const before = await snapshot();

    const file = throughJson(await store.exportBackup());
    for (const tome of await db.tomes.toArray()) await store.deleteTome(tome.id);
    expect((await snapshot()).plotItems).toHaveLength(0);

    const result = await store.restoreBackup(file, "replace");

    expect(result).toMatchObject({ added: 2, replaced: 0, kept: 0 });
    expect(await snapshot()).toEqual(before);
    for (const tome of await db.tomes.toArray()) await expectSpineIntact(tome.id);
  });

  it("restoring the same file twice changes nothing", async () => {
    const { tome } = await fullTome("The Long Road");
    const file = throughJson(await store.exportBackup());

    await store.restoreBackup(file, "replace");
    const once = await snapshot();
    expect(await store.restoreBackup(file, "merge")).toMatchObject({
      added: 0,
      replaced: 0,
      kept: 1,
    });

    expect(await snapshot()).toEqual(once);
    await expectSpineIntact(tome.id);
  });

  it("carries an uploaded cover image through the file as bytes", async () => {
    const { tome } = await fullTome("The Long Road");
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 13, 10]);
    await store.saveTome({
      ...tome,
      coverImage: { kind: "local", blob: new Blob([bytes], { type: "image/png" }) },
    });

    const file = throughJson(await store.exportTomeBackup(tome.id));
    await store.deleteTome(tome.id);
    await store.restoreBackup(file, "merge");

    const cover = (await db.tomes.get(tome.id))!.coverImage;
    expect(cover?.kind).toBe("local");
    if (cover?.kind !== "local") throw new Error("cover did not come back local");
    expect(cover.blob.type).toBe("image/png");
    expect(new Uint8Array(await cover.blob.arrayBuffer())).toEqual(bytes);
  });

  it("keeps an https cover image as a link rather than inlining it", async () => {
    const { tome } = await fullTome("The Long Road");
    await store.saveTome({
      ...tome,
      coverImage: { kind: "url", url: "https://example.com/cover.png" },
    });

    const file = throughJson(await store.exportTomeBackup(tome.id));

    expect(file.tomes[0].tome.coverImage).toEqual({
      kind: "url",
      url: "https://example.com/cover.png",
    });
  });

  it("exports one tome in the same shape as the whole library", async () => {
    const { tome } = await fullTome("The Long Road");
    const other = await fullTome("Second Book");

    const one = await store.exportTomeBackup(tome.id);

    expect(one.tomes).toHaveLength(1);
    expect(one.tomes[0].tome.id).toBe(tome.id);
    expect(one.tomes[0].elements.map((e) => e.tomeId)).toEqual([tome.id, tome.id]);
    // Restoring it into an empty browser gives that tome and nothing else.
    await store.restoreBackup(throughJson(one), "replace");
    expect((await db.tomes.toArray()).map((t) => t.id)).toEqual([tome.id]);
    expect(await db.plotItems.where("tomeId").equals(other.tome.id).count()).toBe(0);
  });
});

describe("restore modes", () => {
  it("replace drops tomes the file has never heard of", async () => {
    const kept = await fullTome("In The File");
    const file = throughJson(await store.exportTomeBackup(kept.tome.id));
    const doomed = await fullTome("Only Here");

    await store.restoreBackup(file, "replace");

    expect((await db.tomes.toArray()).map((t) => t.title)).toEqual(["In The File"]);
    expect(await db.writeItems.where("tomeId").equals(doomed.tome.id).count()).toBe(0);
  });

  it("merge adds a tome this browser has never seen", async () => {
    const incoming = await fullTome("Second Book");
    const file = throughJson(await store.exportTomeBackup(incoming.tome.id));
    await store.deleteTome(incoming.tome.id);
    const here = await fullTome("The Long Road");

    expect(await store.restoreBackup(file, "merge")).toMatchObject({
      added: 1,
      replaced: 0,
      kept: 0,
    });
    expect((await db.tomes.orderBy("title").toArray()).map((t) => t.title)).toEqual([
      "Second Book",
      "The Long Road",
    ]);
    await expectSpineIntact(here.tome.id);
    await expectSpineIntact(incoming.tome.id);
  });

  it("merge takes the file's copy when it is the newer one", async () => {
    const { tome, plots } = await fullTome("The Long Road");
    await addBeat(tome.id, plots[0].id, "written on the other browser");
    const file = throughJson(await store.exportTomeBackup(tome.id));

    // Roll this browser back to a state older than the file.
    await store.deleteTome(tome.id);
    await store.restoreBackup(file, "replace");
    const restored = await beatsOf(plots[0].id);
    expect(restored.map((b) => b.title)).toEqual([
      "the duel",
      "written on the other browser",
    ]);
    await store.deletePlotItem(restored[1]);
    await db.tomes.update(tome.id, { updatedAt: "2000-01-01T00:00:00.000Z" });
    await db.plotItems
      .where("tomeId")
      .equals(tome.id)
      .modify({ updatedAt: "2000-01-01T00:00:00.000Z" });
    await db.plotRows
      .where("tomeId")
      .equals(tome.id)
      .modify({ updatedAt: "2000-01-01T00:00:00.000Z" });
    await db.writeItems
      .where("tomeId")
      .equals(tome.id)
      .modify({ updatedAt: "2000-01-01T00:00:00.000Z" });
    await db.elements
      .where("tomeId")
      .equals(tome.id)
      .modify({ updatedAt: "2000-01-01T00:00:00.000Z" });
    await db.elementTypes
      .where("tomeId")
      .equals(tome.id)
      .modify({ updatedAt: "2000-01-01T00:00:00.000Z" });
    await db.relationships
      .where("tomeId")
      .equals(tome.id)
      .modify({ updatedAt: "2000-01-01T00:00:00.000Z" });
    await db.plots
      .where("tomeId")
      .equals(tome.id)
      .modify({ updatedAt: "2000-01-01T00:00:00.000Z" });

    expect(await store.restoreBackup(file, "merge")).toMatchObject({
      added: 0,
      replaced: 1,
      kept: 0,
    });
    expect((await beatsOf(plots[0].id)).map((b) => b.title)).toEqual([
      "the duel",
      "written on the other browser",
    ]);
    await expectSpineIntact(tome.id);
  });

  it("merges over a tome whose cover image is an uploaded blob", async () => {
    // Weighing the two copies means reading the tome that is about to be
    // overwritten, from inside the restore's transaction — the one path where a
    // stored `Blob` is in reach of transactional code. `localTouchedAt` never
    // touches the bytes, and this is the case that would notice if it started.
    const { tome } = await fullTome("The Long Road");
    await store.saveTome({
      ...tome,
      coverImage: {
        kind: "local",
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      },
    });
    const file = throughJson(await store.exportTomeBackup(tome.id));
    const newer: BackupFile = {
      ...file,
      tomes: [{ ...file.tomes[0], touchedAt: "2099-01-01T00:00:00.000Z" }],
    };

    expect(await store.restoreBackup(newer, "merge")).toMatchObject({
      added: 0,
      replaced: 1,
      kept: 0,
    });
    expect((await db.tomes.get(tome.id))!.coverImage?.kind).toBe("local");
    await expectSpineIntact(tome.id);
  });

  it("merge notices prose written after the tome row was last touched", async () => {
    const { tome, write } = await fullTome("The Long Road");
    const file = throughJson(await store.exportTomeBackup(tome.id));

    // Writing never touches the tome row, so comparing tome rows alone would
    // call this browser "not newer" and throw the chapter away.
    await store.saveWriteItem({
      id: write.id,
      title: "Chapter One",
      type: "chapter",
      content: "{}",
      preview: "It began on the road.",
    });

    expect(await store.restoreBackup(file, "merge")).toMatchObject({
      added: 0,
      replaced: 0,
      kept: 1,
    });
    expect((await db.writeItems.get(write.id))!.title).toBe("Chapter One");
  });

  it("summarizes what a merge would do to each tome", async () => {
    const stale = await fullTome("Stale In File");
    const staleFile = throughJson(await store.exportTomeBackup(stale.tome.id));
    await addBeat(stale.tome.id, stale.plots[0].id, "newer here");
    const gone = await fullTome("Not Here Yet");
    const goneFile = throughJson(await store.exportTomeBackup(gone.tome.id));
    await store.deleteTome(gone.tome.id);

    const summary = await store.summarizeBackup({
      ...staleFile,
      tomes: [...staleFile.tomes, ...goneFile.tomes],
    });

    expect(summary.tomes.map((t) => [t.title, t.mergeAction])).toEqual([
      ["Stale In File", "keep"],
      ["Not Here Yet", "add"],
    ]);
    expect(summary.tomes[1]).toMatchObject({ elements: 2, plots: 2, writeItems: 1 });
  });
});

describe("author profiles", () => {
  /** Dates a profile, so which copy is newer is staged rather than raced. */
  const dateAuthor = (id: string, updatedAt: string) => db.authors.update(id, { updatedAt });

  it("a one-tome file carries the profile its tome credits, and only that one", async () => {
    const first = await fullTome("The Long Road");
    await fullTome("Second Book");

    const file = throughJson(await store.exportTomeBackup(first.tome.id));

    expect(file.authors.map((author) => author.id)).toEqual([first.author.id]);
  });

  it("a whole-library file carries every profile, credited or not", async () => {
    const { author } = await fullTome("The Long Road");
    const spare = await store.createDraftAuthor();
    await store.updateAuthor(spare.id, { name: "Nora Roberts", pseudonym: "J.D. Robb" });

    const file = throughJson(await store.exportBackup());

    expect(file.authors.map((a) => a.id).sort()).toEqual([author.id, spare.id].sort());
  });

  it("merges a profile by its own date, whatever happens to the tome beside it", async () => {
    // The other browser edited the bio; this one has newer prose. The tome is
    // kept — this copy is newer — but the bio still has to arrive, or two
    // browsers would each call themselves up to date holding different bios.
    const { tome, author, write } = await fullTome("The Long Road");
    const file = throughJson(await store.exportTomeBackup(tome.id));
    await store.saveWriteItem({
      id: write.id,
      title: "Chapter One",
      type: "chapter",
      content: "{}",
      preview: "",
    });
    const edited: BackupFile = {
      ...file,
      authors: [{ ...file.authors[0], name: "Renamed Elsewhere", updatedAt: "2099-01-01T00:00:00.000Z" }],
    };

    const result = await store.restoreBackup(edited, "merge");

    expect(result).toMatchObject({ kept: 1, authors: { replaced: 1 } });
    expect((await db.authors.get(author.id))!.name).toBe("Renamed Elsewhere");
    expect((await db.writeItems.get(write.id))!.title).toBe("Chapter One");
  });

  it("leaves a newer profile here alone, even when the tome beside it is replaced", async () => {
    const { tome, author } = await fullTome("The Long Road");
    const file = throughJson(await store.exportTomeBackup(tome.id));
    await store.updateAuthor(author.id, { name: "Edited Here" });
    await dateAuthor(author.id, "2099-01-01T00:00:00.000Z");
    const newerTome: BackupFile = {
      ...file,
      tomes: [{ ...file.tomes[0], touchedAt: "2099-01-01T00:00:00.000Z" }],
    };

    const result = await store.restoreBackup(newerTome, "merge");

    expect(result).toMatchObject({ replaced: 1, authors: { kept: 1 } });
    expect((await db.authors.get(author.id))!.name).toBe("Edited Here");
  });

  it("replace drops profiles the file does not carry", async () => {
    const kept = await fullTome("In The File");
    const file = throughJson(await store.exportTomeBackup(kept.tome.id));
    const doomed = await fullTome("Only Here");

    await store.restoreBackup(file, "replace");

    expect((await db.authors.toArray()).map((a) => a.id)).toEqual([kept.author.id]);
    expect(await db.authors.get(doomed.author.id)).toBeUndefined();
  });

  it("carries an uploaded author photo through the file as bytes", async () => {
    const { author } = await fullTome("The Long Road");
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    await store.updateAuthor(author.id, {
      image: { kind: "local", blob: new Blob([bytes], { type: "image/png" }) },
    });

    const file = throughJson(await store.exportBackup());
    await store.deleteAuthor(author.id);
    await store.restoreBackup(file, "merge");

    const image = (await db.authors.get(author.id))!.image;
    if (image?.kind !== "local") throw new Error("photo did not come back local");
    expect(new Uint8Array(await image.blob.arrayBuffer())).toEqual(bytes);
  });

  it("gives a profile a file of its own, with no tomes in it", async () => {
    const { author } = await fullTome("The Long Road");

    const file = throughJson(await store.exportAuthorBackup(author.id));

    expect(file.tomes).toEqual([]);
    expect(file.authors.map((a) => a.id)).toEqual([author.id]);
  });

  it("marks each profile for a sync by its byline and its own date", async () => {
    const { author } = await fullTome("The Long Road");

    expect(await store.authorMarks()).toEqual([
      { id: author.id, title: "A. Pen", touchedAt: author.updatedAt },
    ]);
  });

  it("summarizes what a merge would do to each profile", async () => {
    const { tome, author } = await fullTome("The Long Road");
    const file = throughJson(await store.exportTomeBackup(tome.id));
    const stranger = { ...file.authors[0], id: "someone-else", name: "Stranger", pseudonym: undefined };

    const summary = await store.summarizeBackup({ ...file, authors: [file.authors[0], stranger] });

    expect(summary.authors).toEqual([
      { id: author.id, byline: "A. Pen", mergeAction: "keep" },
      { id: "someone-else", byline: "Stranger", mergeAction: "add" },
    ]);
  });
});

describe("files from other versions", () => {
  it("restores a file from before author profiles with none", async () => {
    const { tome } = await fullTome("The Long Road");
    const { authors: _, ...old } = await store.exportTomeBackup(tome.id);
    void _;
    await store.deleteTome(tome.id);

    const file = parseBackup(JSON.stringify(old));
    await store.restoreBackup(file, "merge");

    expect(file.authors).toEqual([]);
    expect(await db.tomes.get(tome.id)).toBeDefined();
  });

  it("puts beats from a pre-spine file onto a spine", async () => {
    const { tome, plots } = await fullTome("The Long Road");
    await addBeat(tome.id, plots[0].id, "and then");
    const file = throughJson(await store.exportTomeBackup(tome.id));

    // What a v5 export would have held: ordered beats, no rows, no writeItemIds.
    const old: BackupFile = {
      ...file,
      schemaVersion: 5,
      tomes: [
        {
          ...file.tomes[0],
          plotRows: [],
          plotItems: file.tomes[0].plotItems.map((item) => {
            const { plotRowId: _row, writeItemIds: _ids, ...rest } = item;
            return rest as PlotItem;
          }),
        },
      ],
    };

    await store.restoreBackup(old, "replace");

    await expectSpineIntact(tome.id);
    expect((await beatsOf(plots[0].id)).map((b) => b.title)).toEqual([
      "the duel",
      "and then",
    ]);
    expect((await beatsOf(plots[0].id)).map((b) => b.writeItemIds)).toEqual([[], []]);
  });

  it("counts the words of prose from a pre-v8 file", async () => {
    const { tome } = await fullTome("The Long Road");
    const item = await store.createDraftWriteItem(tome.id, "chapter");
    await store.saveWriteItem({
      id: item.id,
      title: "The salt road",
      type: "chapter",
      content: JSON.stringify({
        root: {
          type: "root",
          version: 1,
          children: [
            {
              type: "paragraph",
              version: 1,
              children: [
                { type: "text", text: "Nine miles to the ferry.", format: 0, version: 1 },
              ],
            },
          ],
        },
      }),
      preview: "Nine miles to the ferry.",
    });
    const file = throughJson(await store.exportTomeBackup(tome.id));

    // What a v7 export held: the document, and no count derived from it.
    const old: BackupFile = {
      ...file,
      schemaVersion: 7,
      tomes: [
        {
          ...file.tomes[0],
          writeItems: file.tomes[0].writeItems.map((row) => {
            const { wordCount: _drop, ...rest } = row;
            return rest as WriteItem;
          }),
        },
      ],
    };

    await store.restoreBackup(old, "replace");

    // A restore bypasses Dexie's upgrades, so the field the v8 upgrade would
    // have filled has to be derived here instead — otherwise a library restored
    // from an older file reads as a shelf of zero-word chapters.
    const stored = await db.writeItems.get(item.id);
    expect(stored!.wordCount).toBe(5);
  });

  it("converts a pre-v9 element description into prose", async () => {
    const { tome, ash } = await fullTome("The Long Road");
    const file = throughJson(await store.exportTomeBackup(tome.id));

    // What a v1 file held: plain text in `description`, and neither mirror.
    const old: BackupFile = {
      ...file,
      formatVersion: 1,
      schemaVersion: 8,
      tomes: [
        {
          ...file.tomes[0],
          elements: file.tomes[0].elements.map((element) => {
            const { descriptionText: _text, searchText: _search, ...rest } = element;
            return { ...rest, description: "A smith.\nQuiet about it." };
          }),
        },
      ],
    };

    await store.restoreBackup(old, "replace");

    // A restore bypasses Dexie's upgrades, so what the v9 backfill would have
    // done has to happen here — otherwise the editor opens on unparseable text
    // and every card shows a paragraph of nothing.
    const stored = (await db.elements.get(ash.id))!;
    expect(isProseDocument(stored.description)).toBe(true);
    expect(stored.descriptionText).toBe("A smith.\nQuiet about it.");
    // Derived across the custom fields, exactly as `saveElement` derives it.
    expect(stored.searchText).toBe("Ash\nA smith.\nQuiet about it.\n31");
  });

  it("converts a pre-v10 tome description into prose", async () => {
    const { tome } = await fullTome("The Long Road");
    const file = throughJson(await store.exportTomeBackup(tome.id));

    // What a v2 file held: plain text in `description`, and no mirror.
    const old: BackupFile = {
      ...file,
      formatVersion: 2,
      schemaVersion: 9,
      tomes: [
        {
          ...file.tomes[0],
          tome: (() => {
            const { descriptionText: _text, ...rest } = file.tomes[0].tome;
            return { ...rest, description: "A war, told sideways." };
          })(),
        },
      ],
    };

    await store.restoreBackup(old, "replace");

    // The tome's half of the rule above: what the v10 backfill would have done
    // has to happen here, or the overview opens on unparseable text and every
    // library card shows a paragraph of JSON.
    const stored = (await db.tomes.get(tome.id))!;
    expect(isProseDocument(stored.description)).toBe(true);
    expect(stored.descriptionText).toBe("A war, told sideways.");
  });

  it("refuses a file from a newer version of the app", () => {
    const future = JSON.stringify({
      format: "myTome-backup",
      formatVersion: 99,
      schemaVersion: 99,
      exportedAt: "2030-01-01T00:00:00.000Z",
      tomes: [],
    });
    expect(() => parseBackup(future)).toThrow(/newer version/);
  });

  it("refuses a file that isn't a backup at all", () => {
    expect(() => parseBackup("not json")).toThrow(/isn't readable/);
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow(
      /doesn't look like/,
    );
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: "myTome-backup",
          formatVersion: 1,
          schemaVersion: 7,
          exportedAt: "",
          tomes: [{ notATome: true }],
        }),
      ),
    ).toThrow(/incomplete/);
  });
});

describe("backupFileName", () => {
  it("names a whole-library file by the day it was made", async () => {
    await fullTome("The Long Road");
    await fullTome("Second Book");
    const file = await store.exportBackup();
    expect(backupFileName({ ...file, exportedAt: "2026-08-30T11:00:00.000Z" })).toBe(
      "myTome-backup-2026-08-30.json",
    );
  });

  it("names a one-tome file after the tome", async () => {
    const { tome } = await fullTome("The Long Road: Book II");
    const file = await store.exportTomeBackup(tome.id);
    expect(backupFileName({ ...file, exportedAt: "2026-08-30T11:00:00.000Z" })).toBe(
      "myTome-the-long-road-book-ii-2026-08-30.json",
    );
  });
});
