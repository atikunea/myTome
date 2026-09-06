import { describe, it, expect } from "vitest";
import type { Plot, PlotItem } from "../../models/Plot";
import type { WriteItem } from "../../models/WriteItem";
import {
  defaultDirection,
  sortWriteItems,
  storyKeys,
  uncomposed,
  writeItemUses,
} from "../storyOrder";

/**
 * The Write list's ordering, driven as data. These are plain objects rather than
 * rows out of Dexie: `storyOrder.ts` reads no table, which is exactly why it was
 * pulled out of `WriteListPage` — the sort a reader relies on to find their
 * place in a book is worth an assertion, and it does not need a mounted page to
 * get one.
 */

const plot = (id: string, sortOrder: number): Plot => ({
  id,
  tomeId: "t",
  name: id,
  sortOrder,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const beat = (
  plotId: string,
  sortOrder: number,
  writeItemIds: string[],
): PlotItem => ({
  id: `${plotId}-${sortOrder}`,
  tomeId: "t",
  plotId,
  name: "",
  title: `beat ${sortOrder}`,
  description: "",
  attachedElementIds: [],
  plotRowId: `row-${sortOrder}`,
  writeItemIds,
  sortOrder,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const text = (
  id: string,
  over: Partial<WriteItem> = {},
): WriteItem => ({
  id,
  tomeId: "t",
  title: id,
  type: "passage",
  content: "",
  preview: "",
  wordCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("storyKeys", () => {
  it("keys a text by its plot, its beat and its place inside that beat", () => {
    const keys = storyKeys(
      [plot("a", 0)],
      [beat("a", 0, ["x", "y"]), beat("a", 1, ["z"])],
    );

    expect(keys.get("x")).toEqual([0, 0, 0]);
    expect(keys.get("y")).toEqual([0, 0, 1]);
    expect(keys.get("z")).toEqual([0, 1, 0]);
  });

  it("takes the earliest beat for a text composed into several", () => {
    // Composed late in the first plot and early in the second: the first wins,
    // so a passage reused later still sorts where it is first read.
    const keys = storyKeys(
      [plot("a", 0), plot("b", 1)],
      [beat("a", 7, ["shared"]), beat("b", 0, ["shared"])],
    );

    expect(keys.get("shared")).toEqual([0, 7, 0]);
  });

  it("orders by plot before beat — story order is plot-major", () => {
    const keys = storyKeys(
      [plot("a", 0), plot("b", 1)],
      [beat("b", 0, ["early-in-b"]), beat("a", 9, ["late-in-a"])],
    );

    // The whole of plot A precedes the whole of plot B, however deep the beat.
    expect(keys.get("late-in-a")![0]).toBeLessThan(keys.get("early-in-b")![0]);
  });

  it("parks a beat whose plot is not in the list at the end", () => {
    const keys = storyKeys([plot("a", 0)], [beat("gone", 0, ["orphan"])]);

    expect(keys.get("orphan")).toEqual([Infinity, 0, 0]);
  });

  it("tolerates a beat that arrived without its writeItemIds array", () => {
    const legacy = { ...beat("a", 0, []), writeItemIds: undefined } as unknown as PlotItem;

    expect(() => storyKeys([plot("a", 0)], [legacy])).not.toThrow();
  });
});

describe("sortWriteItems", () => {
  const keys = storyKeys([plot("a", 0)], [beat("a", 0, ["second", "third"])]);

  it("orders by recency, newest first", () => {
    const visible = sortWriteItems({
      items: [
        text("old", { updatedAt: "2026-01-01T00:00:00.000Z" }),
        text("new", { updatedAt: "2026-06-01T00:00:00.000Z" }),
      ],
      typeFilter: "all",
      sort: "recent",
      keys: new Map(),
    });

    expect(visible.map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("puts composed texts in reading order and uncomposed ones after them", () => {
    const visible = sortWriteItems({
      items: [
        text("loose", { updatedAt: "2026-09-01T00:00:00.000Z" }),
        text("third"),
        text("second"),
      ],
      typeFilter: "all",
      sort: "story",
      keys,
    });

    // "loose" is the most recently touched and still sorts last: story order
    // beats recency, which is the whole point of the mode.
    expect(visible.map((item) => item.id)).toEqual(["second", "third", "loose"]);
  });

  it("falls back to recency among texts no beat composes", () => {
    const visible = sortWriteItems({
      items: [
        text("stale", { updatedAt: "2026-01-01T00:00:00.000Z" }),
        text("fresh", { updatedAt: "2026-06-01T00:00:00.000Z" }),
      ],
      typeFilter: "all",
      sort: "story",
      keys,
    });

    expect(visible.map((item) => item.id)).toEqual(["fresh", "stale"]);
  });

  it("sorts alphabetically, calling a blank title Untitled", () => {
    const visible = sortWriteItems({
      items: [text("z", { title: "Zephyr" }), text("blank", { title: "" })],
      typeFilter: "all",
      sort: "alpha",
      keys: new Map(),
    });

    // "" would sort first; "Untitled" is what the row actually shows, so that
    // is what the list has to sort by or the order looks wrong on screen.
    expect(visible.map((item) => item.id)).toEqual(["blank", "z"]);
  });

  it("filters to one type before ordering", () => {
    const visible = sortWriteItems({
      items: [text("a", { type: "lore" }), text("b", { type: "chapter" })],
      typeFilter: "chapter",
      sort: "recent",
      keys: new Map(),
    });

    expect(visible.map((item) => item.id)).toEqual(["b"]);
  });

  it("leaves the caller's array untouched", () => {
    const items = [
      text("old", { updatedAt: "2026-01-01T00:00:00.000Z" }),
      text("new", { updatedAt: "2026-06-01T00:00:00.000Z" }),
    ];

    sortWriteItems({ items, typeFilter: "all", sort: "recent", keys: new Map() });

    // The rows come straight from a live query, so sorting them in place would
    // reorder what the next render reads.
    expect(items.map((item) => item.id)).toEqual(["old", "new"]);
  });
});

describe("uncomposed", () => {
  it("sorts after every real key rather than before it", () => {
    const keys = storyKeys([plot("a", 0)], [beat("a", 0, ["real"])]);

    expect(keys.get("real")![0]).toBeLessThan(uncomposed[0]);
  });
});

describe("sortWriteItems — columns and direction", () => {
  it("orders types by the union's own order, not by their alphabet", () => {
    const visible = sortWriteItems({
      items: [
        text("c", { type: "chapter" }),
        text("s", { type: "snippet" }),
        text("p", { type: "passage" }),
        text("l", { type: "lore" }),
      ],
      typeFilter: "all",
      sort: "type",
      keys: new Map(),
    });

    // Alphabetically this would be chapter, lore, passage, snippet — which says
    // nothing. The authored order runs from scratch to finished prose.
    expect(visible.map((item) => item.id)).toEqual(["s", "l", "p", "c"]);
  });

  it("orders by word count, longest first by default", () => {
    const visible = sortWriteItems({
      items: [
        text("short", { wordCount: 12 }),
        text("long", { wordCount: 4200 }),
        text("empty", { wordCount: 0 }),
      ],
      typeFilter: "all",
      sort: "words",
      keys: new Map(),
    });

    expect(visible.map((item) => item.id)).toEqual(["long", "short", "empty"]);
  });

  it("reverses the column when the direction is flipped", () => {
    const items = [text("b", { wordCount: 2 }), text("a", { wordCount: 1 })];

    expect(
      sortWriteItems({
        items,
        typeFilter: "all",
        sort: "words",
        direction: "asc",
        keys: new Map(),
      }).map((item) => item.id),
    ).toEqual(["a", "b"]);
  });

  it("keeps the recency tiebreak pointing the same way in both directions", () => {
    // Two rows the sorted column cannot separate, one clearly newer.
    const items = [
      text("stale", { wordCount: 10, updatedAt: "2026-01-01T00:00:00.000Z" }),
      text("fresh", { wordCount: 10, updatedAt: "2026-06-01T00:00:00.000Z" }),
    ];
    const ids = (direction: "asc" | "desc") =>
      sortWriteItems({
        items,
        typeFilter: "all",
        sort: "words",
        direction,
        keys: new Map(),
      }).map((item) => item.id);

    // Reversing the column the author clicked is the point; reversing which of
    // two indistinguishable rows comes first is only noise.
    expect(ids("desc")).toEqual(["fresh", "stale"]);
    expect(ids("asc")).toEqual(["fresh", "stale"]);
  });

  it("opens dates and word counts at their largest, names at their first letter", () => {
    // The one-click reading of each column, asserted where it is decided.
    expect(defaultDirection.recent).toBe("desc");
    expect(defaultDirection.words).toBe("desc");
    expect(defaultDirection.alpha).toBe("asc");
    expect(defaultDirection.story).toBe("asc");
    expect(defaultDirection.type).toBe("asc");
  });
});

describe("sortWriteItems — search", () => {
  const items = [
    text("titled", { title: "The salt road", preview: "" }),
    text("bodied", { title: "Untitled", preview: "They took the salt road east." }),
    text("other", { title: "Ferry", preview: "The crossing." }),
  ];

  it("matches the title and the stored preview, ignoring case", () => {
    const visible = sortWriteItems({
      items,
      typeFilter: "all",
      query: "SALT",
      sort: "alpha",
      keys: new Map(),
    });

    // The preview is only the first 240 characters of the document, so this
    // finds openings rather than everything — which is what the box promises.
    expect(visible.map((item) => item.id).sort()).toEqual(["bodied", "titled"]);
  });

  it("ignores a query that is only whitespace", () => {
    const visible = sortWriteItems({
      items,
      typeFilter: "all",
      query: "   ",
      sort: "alpha",
      keys: new Map(),
    });

    expect(visible).toHaveLength(3);
  });

  it("narrows within the type filter rather than around it", () => {
    const visible = sortWriteItems({
      items: [
        text("a", { type: "lore", title: "salt" }),
        text("b", { type: "chapter", title: "salt" }),
      ],
      typeFilter: "chapter",
      query: "salt",
      sort: "alpha",
      keys: new Map(),
    });

    expect(visible.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("writeItemUses", () => {
  it("names every beat composing a text, in reading order", () => {
    const uses = writeItemUses(
      [plot("a", 0), plot("b", 1)],
      [beat("b", 0, ["shared"]), beat("a", 3, ["shared"])],
    );

    // Reuse across beats is the model working as designed, so both appear —
    // and plot-major order puts the later beat of plot A ahead of plot B's.
    expect(uses.get("shared")!.map((use) => use.beatTitle)).toEqual([
      "beat 3",
      "beat 0",
    ]);
    expect(uses.get("shared")!.map((use) => use.plotName)).toEqual(["a", "b"]);
  });

  it("has no entry at all for a text no beat composes", () => {
    const uses = writeItemUses([plot("a", 0)], [beat("a", 0, ["used"])]);

    // The row renders "Not used" from the absence; an empty array would mean
    // the same thing twice.
    expect(uses.has("loose")).toBe(false);
  });

  it("drops a beat whose plot has gone rather than naming a missing plot", () => {
    const uses = writeItemUses([plot("a", 0)], [beat("gone", 0, ["orphan"])]);

    expect(uses.has("orphan")).toBe(false);
  });

  it("falls back to the beat label, then to Untitled beat", () => {
    const labelled = { ...beat("a", 0, ["x"]), title: "", name: "Act I" };
    const nameless = { ...beat("a", 1, ["y"]), title: "", name: "  " };

    const uses = writeItemUses([plot("a", 0)], [labelled, nameless]);

    // The same rule the manuscript export prints its beat headings by.
    expect(uses.get("x")![0].beatTitle).toBe("Act I");
    expect(uses.get("y")![0].beatTitle).toBe("Untitled beat");
  });

  it("tolerates a beat that arrived without its writeItemIds array", () => {
    const legacy = { ...beat("a", 0, []), writeItemIds: undefined } as unknown as PlotItem;

    expect(() => writeItemUses([plot("a", 0)], [legacy])).not.toThrow();
  });
});
