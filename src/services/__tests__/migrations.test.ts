import { describe, it, expect, afterEach } from "vitest";
import Dexie, { type Transaction } from "dexie";
import {
  backfillElementProse,
  backfillPlotRows,
  backfillWordCounts,
  MyTomeDB,
} from "../../models/db";
import { documentText, isProseDocument } from "../../lexical/blocks";
import type { PlotItem, PlotRow } from "../../models/Plot";

/**
 * The upgrade path, which is the one piece of code that runs in an author's
 * browser exactly once and can never be re-run. Everything else in this suite
 * opens the `db` singleton; these tests instead build a database stamped at an
 * *older* version under its own name, close it, and open `MyTomeDB` over the
 * top — which is the only way to make Dexie actually replay an `.upgrade()`.
 */

const v4Stores = {
  tomes: "id, status, updatedAt, title",
  elementTypes: "id, tomeId, [tomeId+sortOrder], slug",
  elements:
    "id, tomeId, elementTypeId, [tomeId+elementTypeId], [elementTypeId+updatedAt], name",
  activities: "id, tomeId, [tomeId+occurredAt]",
  relationships:
    "id, tomeId, fromElementId, toElementId, [tomeId+fromElementTypeId+toElementTypeId]",
  plots: "id, tomeId, [tomeId+sortOrder]",
  plotItems: "id, tomeId, plotId, [plotId+sortOrder], *attachedElementIds",
};

const v6Stores = {
  ...v4Stores,
  plotItems:
    "id, tomeId, plotId, [plotId+sortOrder], *attachedElementIds, *writeItemIds",
  writeItems: "id, tomeId, [tomeId+type], [tomeId+updatedAt], title",
};

const v7Stores = {
  ...v6Stores,
  plotRows: "id, tomeId, [tomeId+sortOrder]",
  plotItems:
    "id, tomeId, plotId, [plotId+sortOrder], plotRowId, *attachedElementIds, *writeItemIds",
};

/** A pre-v8 prose row: a stored document, and no count derived from it yet. */
const legacyText = (id: string, ...words: string[]) => ({
  id,
  tomeId: "t1",
  title: id,
  type: "passage",
  content: JSON.stringify({
    root: {
      children: words.map((line) => ({
        type: "paragraph",
        version: 1,
        children: [{ type: "text", text: line, format: 0, version: 1 }],
      })),
      type: "root",
      version: 1,
    },
  }),
  preview: words.join(" "),
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
});

/** A pre-spine beat: no `plotRowId`, order carried by `sortOrder` alone. */
const legacyBeat = (
  tomeId: string,
  plotId: string,
  title: string,
  sortOrder: number,
  over: Partial<PlotItem> = {},
) => ({
  id: `${plotId}-${sortOrder}`,
  tomeId,
  plotId,
  name: "",
  title,
  description: "",
  attachedElementIds: [],
  writeItemIds: [],
  sortOrder,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  ...over,
});

const names: string[] = [];

/** Opens a database stamped at an old version, seeds it, and closes it again. */
const seedLegacy = async (
  version: 4 | 6 | 7 | 8,
  seed: (write: (table: string, rows: unknown[]) => Promise<unknown>) => Promise<void>,
) => {
  const name = `myTomeDB-test-${crypto.randomUUID()}`;
  names.push(name);
  const old = new Dexie(name);
  // v8 added a field, not an index, so a v8 database is stamped v8 over v7's stores.
  const stores = { 4: v4Stores, 6: v6Stores, 7: v7Stores, 8: v7Stores }[version];
  old.version(version).stores(stores);
  await old.open();
  await seed((table, rows) => old.table(table).bulkAdd(rows));
  old.close();
  return name;
};

/** Reopens the seeded database as the current schema, running every upgrade. */
const upgrade = async (name: string) => {
  const db = new MyTomeDB(name);
  await db.open();
  expect(db.verno).toBe(9);
  const items = await db.plotItems.toArray();
  const rows = await db.plotRows.toArray();
  db.close();
  return { items, rows };
};

/** Calls the v7 upgrade again by hand, over a database that already ran it. */
const rerunBackfill = async (name: string) => {
  const db = new MyTomeDB(name);
  await db.open();
  await db.transaction("rw", db.plotRows, db.plotItems, () =>
    backfillPlotRows(Dexie.currentTransaction as Transaction),
  );
  const items = await db.plotItems.toArray();
  const rows = await db.plotRows.toArray();
  db.close();
  return { items, rows };
};

/** A tome's spine ids in order, and the row each of a plot's beats stands on. */
const layout = (rows: PlotRow[], items: PlotItem[], tomeId: string) => {
  const spine = rows
    .filter((row) => row.tomeId === tomeId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => row.id);
  const columns = new Map<string, (string | null)[]>();
  for (const item of items.filter((x) => x.tomeId === tomeId)) {
    const column = columns.get(item.plotId) ?? spine.map(() => null);
    column[spine.indexOf(item.plotRowId)] = item.title;
    columns.set(item.plotId, column);
  }
  return { spine, columns };
};

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe("v7 — backfillPlotRows", () => {
  it("gives a tome a spine as deep as its longest plot, aligned by position", async () => {
    const name = await seedLegacy(6, async (write) => {
      await write("plotItems", [
        legacyBeat("t1", "pA", "a1", 0),
        legacyBeat("t1", "pA", "a2", 1),
        legacyBeat("t1", "pA", "a3", 2),
        legacyBeat("t1", "pB", "b1", 0),
        legacyBeat("t1", "pB", "b2", 1),
      ]);
    });

    const { items, rows } = await upgrade(name);
    const { spine, columns } = layout(rows, items, "t1");

    expect(spine).toHaveLength(3);
    // Index parity is the only alignment the pre-v7 data can justify, and it is
    // what the old side-by-side compare view already drew.
    expect(columns.get("pA")).toEqual(["a1", "a2", "a3"]);
    expect(columns.get("pB")).toEqual(["b1", "b2", null]);
    expect(items.every((item) => Boolean(item.plotRowId))).toBe(true);
  });

  it("gives each tome its own spine", async () => {
    const name = await seedLegacy(6, async (write) => {
      await write("plotItems", [
        legacyBeat("t1", "pA", "a1", 0),
        legacyBeat("t1", "pA", "a2", 1),
        legacyBeat("t2", "pC", "c1", 0),
      ]);
    });

    const { items, rows } = await upgrade(name);

    expect(rows.filter((r) => r.tomeId === "t1")).toHaveLength(2);
    expect(rows.filter((r) => r.tomeId === "t2")).toHaveLength(1);
    const t1Rows = new Set(rows.filter((r) => r.tomeId === "t1").map((r) => r.id));
    expect(
      items.filter((i) => i.tomeId === "t2").every((i) => !t1Rows.has(i.plotRowId)),
    ).toBe(true);
  });

  /**
   * Re-running the backfill is the state rule 4 of AGENTS.md describes: if a
   * shipped upgrade turns out to have been missing or wrong, the remedy is a new
   * no-op version carrying it again, over databases that already ran it. So the
   * function is called directly here rather than through an open — Dexie will
   * never replay an upgrade for a version already applied.
   */
  it("is a no-op when re-run over an already-migrated database", async () => {
    const name = await seedLegacy(6, async (write) => {
      await write("plotItems", [
        legacyBeat("t1", "pA", "a1", 0),
        legacyBeat("t1", "pA", "a2", 1),
        legacyBeat("t1", "pB", "b1", 0),
      ]);
    });
    const before = await upgrade(name);

    const after = await rerunBackfill(name);
    expect(after.rows).toEqual(before.rows);
    expect(after.items).toEqual(before.items);
  });

  it("tops the spine up on a re-run and places only the beats still missing a row", async () => {
    const name = await seedLegacy(6, async (write) => {
      await write("plotItems", [
        legacyBeat("t1", "pA", "a1", 0),
        legacyBeat("t1", "pA", "a2", 1),
      ]);
    });
    const before = await upgrade(name);
    const kept = layout(before.rows, before.items, "t1").spine;

    // A beat with no row, deeper than the spine currently goes — the shortfall a
    // resumed or corrected run has to make up.
    const db = new MyTomeDB(name);
    await db.open();
    await db.plotItems.add(legacyBeat("t1", "pA", "a3", 2) as PlotItem);
    db.close();

    const after = await rerunBackfill(name);
    const { spine, columns } = layout(after.rows, after.items, "t1");

    // Rows are topped up, not recreated: the two that existed keep their ids and
    // their places, and the beats standing on them were never touched.
    expect(spine).toEqual([...kept, spine[2]]);
    expect(spine).toHaveLength(3);
    expect(columns.get("pA")).toEqual(["a1", "a2", "a3"]);
  });

  it("leaves a tome with no beats without a spine", async () => {
    const name = await seedLegacy(6, async (write) => {
      await write("plots", [
        {
          id: "pEmpty",
          tomeId: "t1",
          name: "Empty",
          sortOrder: 0,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);
    });

    const { rows } = await upgrade(name);
    expect(rows).toEqual([]);
  });
});

describe("v5/v6 — backfillWriteItemIds", () => {
  it("gives every v4-era beat the array its multiEntry index requires", async () => {
    const name = await seedLegacy(4, async (write) => {
      const { writeItemIds: _drop, ...beat } = legacyBeat("t1", "pA", "a1", 0);
      await write("plotItems", [beat]);
    });

    const { items } = await upgrade(name);
    expect(items[0].writeItemIds).toEqual([]);
    // The v7 upgrade ran over the same rows in the same open.
    expect(items[0].plotRowId).toBeTruthy();
  });
});

describe("v8 — backfillWordCounts", () => {
  /** Opens the seeded database as the current schema and reads its prose rows. */
  const upgradeTexts = async (name: string) => {
    const db = new MyTomeDB(name);
    await db.open();
    const items = await db.writeItems.toArray();
    db.close();
    return items;
  };

  it("counts the words already in a v7-era document", async () => {
    const name = await seedLegacy(7, async (write) => {
      await write("writeItems", [
        legacyText("one", "the salt road", "ran east"),
        legacyText("empty"),
      ]);
    });

    const items = await upgradeTexts(name);

    // The count has to be *derived* here, not defaulted: a library upgraded
    // into v8 would otherwise read as a tome of zero-word chapters.
    expect(items.find((item) => item.id === "one")!.wordCount).toBe(5);
    expect(items.find((item) => item.id === "empty")!.wordCount).toBe(0);
  });

  it("leaves a count that is already there alone on a re-run", async () => {
    const name = await seedLegacy(7, async (write) => {
      await write("writeItems", [legacyText("one", "two words here")]);
    });
    await upgradeTexts(name);

    // Rule 4's remedy is a fresh version carrying the same backfill again, so
    // it is called by hand over a database that has already run it.
    const db = new MyTomeDB(name);
    await db.open();
    await db.writeItems.update("one", { wordCount: 99 });
    await db.transaction("rw", db.writeItems, () =>
      backfillWordCounts(Dexie.currentTransaction as Transaction),
    );
    const after = await db.writeItems.get("one");
    db.close();

    // Not 3: a row holding a number is skipped rather than re-parsed, which is
    // what makes re-running the backfill cheap.
    expect(after!.wordCount).toBe(99);
  });

  it("gives an unreadable document a count of zero rather than throwing", async () => {
    const name = await seedLegacy(7, async (write) => {
      await write("writeItems", [{ ...legacyText("bad"), content: "not json" }]);
    });

    const items = await upgradeTexts(name);

    // An upgrade that throws leaves the database unopenable, so the one row a
    // hand-edited backup damaged must not take the whole library with it.
    expect(items[0].wordCount).toBe(0);
  });
});

describe("v9 — backfillElementProse", () => {
  /** A pre-v9 element: a plain-text description, and neither mirror. */
  const legacyElement = (id: string, name: string, description: string) => ({
    id,
    tomeId: "t1",
    elementTypeId: "ty1",
    name,
    description,
    attributes: { f1: "Ash-grey" },
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  });

  const seedElements = (rows: ReturnType<typeof legacyElement>[]) =>
    seedLegacy(8, async (write) => {
      await write("elementTypes", [
        {
          id: "ty1",
          tomeId: "t1",
          name: "Character",
          slug: "character",
          sortOrder: 0,
          fieldDefinitions: [
            { id: "f1", name: "Eyes", kind: "text", required: false, sortOrder: 0 },
          ],
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ]);
      await write("elements", rows);
    });

  const upgradeElements = async (name: string) => {
    const db = new MyTomeDB(name);
    await db.open();
    expect(db.verno).toBe(9);
    const elements = await db.elements.toArray();
    db.close();
    return elements;
  };

  it("wraps a plain-text description as a document the editor can open", async () => {
    const name = await seedElements([
      legacyElement("e1", "Dov", "A smith.\nQuiet about it."),
      legacyElement("e2", "Maren", ""),
    ]);

    const elements = await upgradeElements(name);
    const dov = elements.find((element) => element.id === "e1")!;
    const maren = elements.find((element) => element.id === "e2")!;

    // Converted, not defaulted: an author's existing notes are the one thing
    // this migration cannot be allowed to drop.
    expect(isProseDocument(dov.description)).toBe(true);
    expect(documentText(dov.description)).toBe("A smith.\nQuiet about it.");
    expect(dov.descriptionText).toBe("A smith.\nQuiet about it.");
    // An empty description still has to be a well-formed document, or the
    // editor has nothing to parse when the author first clicks into it.
    expect(isProseDocument(maren.description)).toBe(true);
    expect(maren.descriptionText).toBe("");
  });

  it("derives searchText across the custom fields too", async () => {
    const name = await seedElements([legacyElement("e1", "Dov", "A smith.")]);

    const [element] = await upgradeElements(name);

    // The mirror a migrated row gets has to match the one `saveElement` writes,
    // or the same query would find an element only after it was next edited.
    expect(element.searchText).toBe("Dov\nA smith.\nAsh-grey");
  });

  it("leaves an already-converted row alone on a re-run", async () => {
    const name = await seedElements([legacyElement("e1", "Dov", "A smith.")]);
    await upgradeElements(name);

    const db = new MyTomeDB(name);
    await db.open();
    const before = (await db.elements.get("e1"))!.description;
    await db.transaction("rw", db.elements, db.elementTypes, () =>
      backfillElementProse(Dexie.currentTransaction as Transaction),
    );
    const after = await db.elements.get("e1");
    db.close();

    // Double-wrapping would bury the author's paragraph inside a document whose
    // only text is JSON — the failure `isProseDocument` exists to prevent.
    expect(after!.description).toBe(before);
    expect(after!.descriptionText).toBe("A smith.");
  });
});
