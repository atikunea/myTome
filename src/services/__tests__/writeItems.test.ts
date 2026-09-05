import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { previewLength, untitledWriteItem } from "../../models/WriteItem";
import { store } from "../store";
import { addBeat, makeTome } from "./helpers";

/**
 * The prose rows themselves. `cascades.test.ts` already covers the beat↔text
 * link — creating a draft into a beat, detaching, and the blank-draft sweep —
 * so what is left here is the autosave target and the reverse lookup the Write
 * list sorts by.
 */

describe("createDraftWriteItem", () => {
  it("creates a row the editor's URL can name immediately", async () => {
    const { tome } = await makeTome();

    const item = await store.createDraftWriteItem(tome.id, "chapter");

    // The row exists before a keystroke, which is what lets the editor open on
    // a real id rather than a create-on-mount effect StrictMode would run twice.
    expect(await db.writeItems.get(item.id)).toBeTruthy();
    expect(item.type).toBe("chapter");
    expect(item.title).toBe(untitledWriteItem);
    expect(item.preview).toBe("");
  });

  it("parses as an empty Lexical document rather than as nothing", async () => {
    const { tome } = await makeTome();

    const item = await store.createDraftWriteItem(tome.id, "snippet");

    expect(() => JSON.parse(item.content)).not.toThrow();
  });

  it("ignores a beat id that no longer names a beat", async () => {
    const { tome } = await makeTome();

    const item = await store.createDraftWriteItem(tome.id, "passage", "gone");

    // The row is still created: losing the draft would lose the click, and the
    // author can compose it into a beat afterwards.
    expect(await db.writeItems.get(item.id)).toBeTruthy();
  });
});

describe("saveWriteItem", () => {
  const seed = async () => {
    const { tome } = await makeTome();
    return { tome, item: await store.createDraftWriteItem(tome.id, "passage") };
  };

  it("writes the title, type, content and preview together", async () => {
    const { item } = await seed();

    await store.saveWriteItem({
      id: item.id,
      title: "Chapter One",
      type: "chapter",
      content: '{"doc":1}',
      preview: "The road west",
    });

    const stored = await db.writeItems.get(item.id);
    expect(stored).toMatchObject({
      title: "Chapter One",
      type: "chapter",
      content: '{"doc":1}',
      preview: "The road west",
    });
    expect(stored!.updatedAt >= item.updatedAt).toBe(true);
  });

  it("keeps a blank title, because autosave fires mid-typing", async () => {
    const { item } = await seed();

    await store.saveWriteItem({
      id: item.id,
      title: "   ",
      type: "passage",
      content: "{}",
      preview: "",
    });

    // Validating here would throw while the author is still clearing the field;
    // the list falls back to "Untitled" for display instead.
    expect((await db.writeItems.get(item.id))!.title).toBe("   ");
  });

  it("truncates the preview to what the hover card can show", async () => {
    const { item } = await seed();

    await store.saveWriteItem({
      id: item.id,
      title: "Long",
      type: "passage",
      content: "{}",
      preview: "x".repeat(previewLength * 3),
    });

    // A whole chapter's text would otherwise ride in every list query.
    expect((await db.writeItems.get(item.id))!.preview).toHaveLength(previewLength);
  });

  it("does nothing for a row that has since been deleted", async () => {
    const { item } = await seed();
    await store.deleteWriteItem(item.id);

    await store.saveWriteItem({
      id: item.id,
      title: "Ghost",
      type: "passage",
      content: "{}",
      preview: "",
    });

    // The unmount flush can land after a delete; it must not resurrect the row.
    expect(await db.writeItems.get(item.id)).toBeUndefined();
  });
});

describe("composingPlotItems", () => {
  it("finds every beat a text is composed into", async () => {
    const { tome, plots } = await makeTome(["A", "B"]);
    const text = await store.createDraftWriteItem(tome.id, "passage");
    const first = await addBeat(tome.id, plots[0].id, "opening");
    const second = await addBeat(tome.id, plots[1].id, "echo");
    const untouched = await addBeat(tome.id, plots[0].id, "later");
    for (const beat of [first, second])
      await store.setPlotItemWriteItems(beat.id, [text.id]);

    const composing = await store.composingPlotItems(text.id);

    expect(composing.map((beat) => beat.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(composing.some((beat) => beat.id === untouched.id)).toBe(false);
  });

  it("returns beats with their id arrays defaulted, like every other read", async () => {
    const { tome, plots } = await makeTome(["A"]);
    const text = await store.createDraftWriteItem(tome.id, "passage");
    const beat = await addBeat(tome.id, plots[0].id, "opening");
    await store.setPlotItemWriteItems(beat.id, [text.id]);

    const [composing] = await store.composingPlotItems(text.id);

    expect(Array.isArray(composing.attachedElementIds)).toBe(true);
    expect(Array.isArray(composing.writeItemIds)).toBe(true);
  });

  it("finds nothing for a text no beat composes", async () => {
    const { tome } = await makeTome();
    const text = await store.createDraftWriteItem(tome.id, "snippet");

    expect(await store.composingPlotItems(text.id)).toEqual([]);
  });
});
