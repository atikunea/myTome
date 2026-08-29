import { describe, it, expect, afterEach } from "vitest";
import Dexie, { type Transaction } from "dexie";
import { backfillPlotRows, MyTomeDB } from "../../models/db";
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
  version: 4 | 6,
  seed: (write: (table: string, rows: unknown[]) => Promise<unknown>) => Promise<void>,
) => {
  const name = `myTomeDB-test-${crypto.randomUUID()}`;
  names.push(name);
  const old = new Dexie(name);
  old.version(version).stores(version === 4 ? v4Stores : v6Stores);
  await old.open();
  await seed((table, rows) => old.table(table).bulkAdd(rows));
  old.close();
  return name;
};

/** Reopens the seeded database as the current schema, running every upgrade. */
const upgrade = async (name: string) => {
  const db = new MyTomeDB(name);
  await db.open();
  expect(db.verno).toBe(7);
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
