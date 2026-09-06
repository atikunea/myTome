import { describe, expect, it } from "vitest";
import type { PlotItem } from "../../models/Plot";
import type { WriteItem, WriteItemType } from "../../models/WriteItem";
import {
  buildManuscript,
  defaultManuscriptOptions,
  manuscriptFileName,
  summarizeSkips,
  type ManuscriptOptions,
} from "../manuscript";

/**
 * The export's decision layer, driven the way `syncPlan.test.ts` drives its
 * own: with plain records and no database. `buildManuscript` reads nothing and
 * writes nothing, so a test that opened Dexie would only be testing Dexie.
 */

const TIME = "2026-01-01T00:00:00.000Z";

const lexical = (...paragraphs: string[][]) =>
  JSON.stringify({
    root: {
      children: paragraphs.map((runs) => ({
        children: runs.map((text) => ({
          detail: 0,
          format: 0,
          mode: "normal",
          style: "",
          text,
          type: "text",
          version: 1,
        })),
        direction: null,
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      })),
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });

const text = (
  id: string,
  title: string,
  type: WriteItemType,
  ...paragraphs: string[][]
): WriteItem => ({
  id,
  tomeId: "t",
  title,
  type,
  content: lexical(...paragraphs),
  preview: "",
  wordCount: 0,
  createdAt: TIME,
  updatedAt: TIME,
});

const beat = (
  id: string,
  sortOrder: number,
  writeItemIds: string[],
  overrides: Partial<PlotItem> = {},
): PlotItem => ({
  id,
  tomeId: "t",
  plotId: "p",
  name: `Beat ${id}`,
  title: `Title ${id}`,
  description: "",
  attachedElementIds: [],
  plotRowId: `row-${sortOrder}`,
  writeItemIds,
  sortOrder,
  createdAt: TIME,
  updatedAt: TIME,
  ...overrides,
});

const build = (
  beats: PlotItem[],
  writeItems: WriteItem[],
  options: Partial<ManuscriptOptions> = {},
) =>
  buildManuscript({
    tomeTitle: "The Long Road",
    plot: { id: "p", name: "Main plot" },
    beats,
    writeItems,
    options: { ...defaultManuscriptOptions, ...options },
  });

describe("buildManuscript", () => {
  it("orders beats by sortOrder and sections by the beat's authored order", () => {
    const manuscript = build(
      [beat("b2", 1, ["w3", "w2"]), beat("b1", 0, ["w1"])],
      [
        text("w1", "One", "passage", ["first"]),
        text("w2", "Two", "passage", ["second"]),
        text("w3", "Three", "passage", ["third"]),
      ],
    );

    expect(manuscript.beats.map((b) => b.beatId)).toEqual(["b1", "b2"]);
    expect(manuscript.beats[1].sections.map((s) => s.writeItemId)).toEqual(["w3", "w2"]);
  });

  it("ignores beats belonging to another plot", () => {
    const manuscript = build(
      [beat("mine", 0, ["w1"]), beat("theirs", 0, ["w2"], { plotId: "other" })],
      [text("w1", "One", "passage", ["a"]), text("w2", "Two", "passage", ["b"])],
    );

    expect(manuscript.beats.map((b) => b.beatId)).toEqual(["mine"]);
  });

  it("leaves out types the filter excludes, and says how many", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1", "w2", "w3"])],
      [
        text("w1", "Scene", "passage", ["kept"]),
        text("w2", "Background", "lore", ["dropped"]),
        text("w3", "Idea", "snippet", ["dropped"]),
      ],
    );

    expect(manuscript.beats[0].sections.map((s) => s.writeItemId)).toEqual(["w1"]);
    expect(summarizeSkips(manuscript.skipped).type).toBe(2);
  });

  it("includes every type when the filter says so", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1", "w2"])],
      [text("w1", "Scene", "passage", ["a"]), text("w2", "Background", "lore", ["b"])],
      { types: ["snippet", "lore", "passage", "chapter"] },
    );

    expect(manuscript.beats[0].sections).toHaveLength(2);
    expect(summarizeSkips(manuscript.skipped).type).toBe(0);
  });

  it("prints a text composed into two beats in both of them", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1"]), beat("b2", 1, ["w1", "w2"])],
      [text("w1", "Shared", "passage", ["once"]), text("w2", "Other", "passage", ["twice"])],
    );

    expect(manuscript.beats[0].sections.map((s) => s.writeItemId)).toEqual(["w1"]);
    expect(manuscript.beats[1].sections.map((s) => s.writeItemId)).toEqual(["w1", "w2"]);
    // A repeat is a note, never an omission.
    expect(manuscript.skipped).toEqual([]);
  });

  it("names a repeated text and every beat it lands in, in reading order", () => {
    const manuscript = build(
      [
        beat("b1", 0, ["w1"], { name: "Departure" }),
        beat("b2", 1, ["w2"], { name: "The ford" }),
        beat("b3", 2, ["w1"], { name: "The bridge" }),
      ],
      [text("w1", "Refrain", "passage", ["a"]), text("w2", "Other", "passage", ["b"])],
    );

    expect(manuscript.repeated).toEqual([
      {
        writeItemId: "w1",
        title: "Refrain",
        beatNames: ["Departure", "The bridge"],
      },
    ]);
  });

  it("counts a repeated text's words once per appearance", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1"]), beat("b2", 1, ["w1"])],
      [text("w1", "Refrain", "passage", ["one two three"])],
    );

    expect(manuscript.words).toBe(6);
  });

  it("reports nothing as repeated when every text appears once", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1"]), beat("b2", 1, ["w2"])],
      [text("w1", "One", "passage", ["a"]), text("w2", "Two", "passage", ["b"])],
    );

    expect(manuscript.repeated).toEqual([]);
  });

  it("does not call a text repeated when the filter left one of its beats out", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1"]), beat("b2", 1, ["w1"])],
      [text("w1", "Lore", "lore", ["a"])],
    );

    expect(manuscript.beats).toEqual([]);
    expect(manuscript.repeated).toEqual([]);
  });

  it("skips a beat that contributes nothing rather than printing a blank page", () => {
    const manuscript = build(
      [beat("b1", 0, []), beat("b2", 1, ["w1"]), beat("b3", 2, ["w2"])],
      [text("w1", "Scene", "passage", ["kept"]), text("w2", "Background", "lore", ["x"])],
    );

    expect(manuscript.beats.map((b) => b.beatId)).toEqual(["b2"]);
    // One beat was empty outright; the other emptied out under the type filter.
    expect(summarizeSkips(manuscript.skipped)).toEqual({ empty: 2, type: 1, missing: 0 });
  });

  it("reports an id with no row behind it instead of rendering a hole", () => {
    const manuscript = build([beat("b1", 0, ["gone", "w1"])], [
      text("w1", "Scene", "passage", ["kept"]),
    ]);

    expect(manuscript.beats[0].sections).toHaveLength(1);
    expect(manuscript.skipped).toContainEqual({
      reason: "missing",
      writeItemId: "gone",
      beatName: "Beat b1",
    });
  });

  it("carries the beat title as a heading only when asked", () => {
    const beats = [beat("b1", 0, ["w1"])];
    const items = [text("w1", "Scene", "passage", ["a"])];

    expect(build(beats, items, { beatHeadings: true }).beats[0].heading).toBe("Title b1");
    expect(build(beats, items, { beatHeadings: false }).beats[0].heading).toBeUndefined();
  });

  it("falls back to the beat label when a beat reached the export untitled", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1"], { title: "  " })],
      [text("w1", "Scene", "passage", ["a"])],
    );

    expect(manuscript.beats[0].heading).toBe("Beat b1");
  });

  it("names an unnamed beat rather than heading a page with nothing", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1"], { title: "  ", name: "   " })],
      [text("w1", "Scene", "passage", ["a"])],
    );

    expect(manuscript.beats[0].heading).toBe("Untitled beat");
  });

  it("counts words per section, per beat and for the whole manuscript", () => {
    const manuscript = build(
      [beat("b1", 0, ["w1", "w2"]), beat("b2", 1, ["w3"])],
      [
        text("w1", "One", "passage", ["one two three"]),
        text("w2", "Two", "passage", ["four five"], ["six"]),
        text("w3", "Three", "passage", ["seven"]),
      ],
    );

    expect(manuscript.beats[0].sections.map((s) => s.words)).toEqual([3, 3]);
    expect(manuscript.beats[0].words).toBe(6);
    expect(manuscript.words).toBe(7);
  });

  it("produces an empty manuscript rather than throwing when nothing qualifies", () => {
    const manuscript = build([beat("b1", 0, ["w1"])], [text("w1", "L", "lore", ["a"])], {
      types: [],
    });

    expect(manuscript.beats).toEqual([]);
    expect(manuscript.words).toBe(0);
  });
});

describe("manuscriptFileName", () => {
  it("slugs the tome and the plot and dates the file", () => {
    expect(
      manuscriptFileName(
        { tomeTitle: "The Long Road", plotName: "Main plot" },
        "docx",
        new Date("2026-09-05T12:00:00.000Z"),
      ),
    ).toBe("myTome-the-long-road-main-plot-2026-09-05.docx");
  });

  it("still names a file when neither title survives slugging", () => {
    expect(
      manuscriptFileName({ tomeTitle: "…", plotName: "!!" }, "docx", new Date("2026-09-05")),
    ).toBe("myTome-manuscript-2026-09-05.docx");
  });
});
