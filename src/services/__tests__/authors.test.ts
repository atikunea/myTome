import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { authorByline, untitledAuthor } from "../../models/Author";
import { documentText, isProseDocument, plainToLexical } from "../../lexical/blocks";
import { store } from "../store";
import { makeTome } from "./helpers";

describe("authorByline", () => {
  it("is the pen name when there is one, and the author's own name when not", () => {
    expect(authorByline({ name: "Nora Roberts", pseudonym: "J.D. Robb" })).toBe("J.D. Robb");
    expect(authorByline({ name: "Nora Roberts" })).toBe("Nora Roberts");
    expect(authorByline({ name: "Nora Roberts", pseudonym: "   " })).toBe("Nora Roberts");
  });
});

describe("createDraftAuthor", () => {
  it("makes a blank profile with a bio the editor can open", async () => {
    const author = await store.createDraftAuthor();

    expect(author.name).toBe(untitledAuthor);
    expect(isProseDocument(author.description)).toBe(true);
    expect(await db.authors.get(author.id)).toEqual(author);
  });

  it("credits the new profile to a tome in the same write", async () => {
    const { tome } = await makeTome();

    const author = await store.createDraftAuthor(tome.id);

    expect((await db.tomes.get(tome.id))!.authorId).toBe(author.id);
  });
});

describe("updateAuthor", () => {
  it("merges over what is stored, not over what the caller was holding", async () => {
    const author = await store.createDraftAuthor();
    await store.updateAuthor(author.id, { name: "Nora Roberts" });

    // A second field saved from a page still holding the draft's name.
    await store.updateAuthor(author.id, { pseudonym: "J.D. Robb" });

    const stored = await db.authors.get(author.id);
    expect(stored).toMatchObject({ name: "Nora Roberts", pseudonym: "J.D. Robb" });
  });

  it("trims, and stores a blank pen name as no pen name at all", async () => {
    const author = await store.createDraftAuthor();
    await store.updateAuthor(author.id, { name: "  Nora Roberts ", pseudonym: "  " });

    const stored = (await db.authors.get(author.id))!;
    expect(stored.name).toBe("Nora Roberts");
    expect(stored.pseudonym).toBeUndefined();
  });

  it("derives the bio's text mirror on every write", async () => {
    const author = await store.createDraftAuthor();
    await store.updateAuthor(author.id, { description: plainToLexical("Lives by the sea.") });

    const stored = (await db.authors.get(author.id))!;
    expect(documentText(stored.description)).toBe("Lives by the sea.");
    expect(stored.descriptionText).toBe("Lives by the sea.");
  });

  it("refuses a cleared name, leaving the row as it was", async () => {
    const author = await store.createDraftAuthor();
    await store.updateAuthor(author.id, { name: "Nora Roberts" });

    await expect(store.updateAuthor(author.id, { name: "   " })).rejects.toThrow(/needs a name/);
    expect((await db.authors.get(author.id))!.name).toBe("Nora Roberts");
  });

  it("refuses a profile that is already gone", async () => {
    await expect(store.updateAuthor("gone", { name: "x" })).rejects.toThrow(/no longer exists/);
  });
});

describe("discardAuthorIfBlank", () => {
  it("drops a draft nobody touched", async () => {
    const author = await store.createDraftAuthor();

    await store.discardAuthorIfBlank(author.id);

    expect(await db.authors.get(author.id)).toBeUndefined();
  });

  it("keeps a draft with anything in it — a name, a pen name, a bio or a photo", async () => {
    const touched = [
      { name: "Nora Roberts" },
      { pseudonym: "J.D. Robb" },
      { description: plainToLexical("Lives by the sea.") },
      { image: { kind: "url" as const, url: "https://example.com/me.png" } },
    ];
    for (const patch of touched) {
      const author = await store.createDraftAuthor();
      await store.updateAuthor(author.id, patch);

      await store.discardAuthorIfBlank(author.id);

      expect(await db.authors.get(author.id), JSON.stringify(patch)).toBeDefined();
    }
  });

  it("drops a blank draft even though a tome credits it, and takes the credit with it", async () => {
    // "New author…" on the overview credits the draft at the click. Abandoned
    // there, it must not leave a book by "New author".
    const { tome } = await makeTome();
    const author = await store.createDraftAuthor(tome.id);

    await store.discardAuthorIfBlank(author.id);

    expect(await db.authors.get(author.id)).toBeUndefined();
    expect((await db.tomes.get(tome.id))!.authorId).toBeUndefined();
  });
});

describe("deleteAuthor", () => {
  it("takes the profile off every tome crediting it, and leaves the tomes", async () => {
    const { tome: one } = await makeTome();
    const { tome: two } = await makeTome();
    const author = await store.createDraftAuthor();
    await store.updateAuthor(author.id, { name: "Nora Roberts" });
    await store.updateTome(one.id, { authorId: author.id });
    await store.updateTome(two.id, { authorId: author.id });
    // Staged, so the assertion below is about the delete and not about a tie.
    await db.tomes.bulkUpdate([
      { key: one.id, changes: { updatedAt: "2000-01-01T00:00:00.000Z" } },
      { key: two.id, changes: { updatedAt: "2000-01-01T00:00:00.000Z" } },
    ]);

    await store.deleteAuthor(author.id);

    expect(await db.authors.get(author.id)).toBeUndefined();
    for (const id of [one.id, two.id]) {
      const tome = (await db.tomes.get(id))!;
      expect(tome.authorId).toBeUndefined();
      // Losing its author is a change to the book, which a sync has to carry.
      expect(tome.updatedAt > "2000-01-01T00:00:00.000Z").toBe(true);
    }
  });
});
