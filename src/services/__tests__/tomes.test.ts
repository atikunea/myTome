import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { documentText, isProseDocument, plainToLexical } from "../../lexical/blocks";
import { store } from "../store";

/**
 * The two writers of a tome row.
 *
 * `saveTome` creates one, and `archivedAt` is the one field on it that is
 * derived rather than given: the library shows "archived on…", so the date has
 * to be the day the author archived the book and not the day they last touched
 * it. It sticks across later edits and clears when the book comes back out —
 * neither of which the caller says anything about.
 *
 * `updateTome` is the overview page's write, and what it has to get right is
 * that it merges over the *stored* row rather than one the caller was holding,
 * since that page has several fields autosaving into one row.
 */

const draft = (over: Partial<Parameters<typeof store.saveTome>[0]> = {}) =>
  store.saveTome({
    title: "The Long Road",
    description: "",
    status: "Draft",
    ...over,
  });

describe("saveTome", () => {
  it("trims the text and drops a subtitle that was only whitespace", async () => {
    const tome = await draft({ title: "  The Long Road  ", subtitle: "   ", description: "  west  " });

    expect(tome.title).toBe("The Long Road");
    // The create dialog still hands over plain text, which is wrapped rather
    // than stored as typed — the overview page can only open a document.
    expect(isProseDocument(tome.description)).toBe(true);
    expect(tome.descriptionText).toBe("west");
    // Stored as absent rather than as "", so `subtitle && …` renders nothing.
    expect(tome.subtitle).toBeUndefined();
  });

  it("passes a document through untouched, and mirrors its text", async () => {
    const tome = await draft({ description: plainToLexical("A war, told sideways.") });

    // Trimming a document would mean editing its JSON, so only plain text is
    // trimmed on the way in.
    expect(documentText(tome.description)).toBe("A war, told sideways.");
    expect(tome.descriptionText).toBe("A war, told sideways.");
  });

  it("refuses a blank title", async () => {
    await expect(draft({ title: "   " })).rejects.toThrow(/title is required/);
    expect(await db.tomes.count()).toBe(0);
  });

  it("edits in place, keeping the id and created time", async () => {
    const created = await draft();

    const edited = await store.saveTome({ ...created, title: "The Longer Road" });

    expect(edited.id).toBe(created.id);
    expect(edited.createdAt).toBe(created.createdAt);
    expect(await db.tomes.count()).toBe(1);
  });

  it("stamps archivedAt when a tome is archived", async () => {
    const created = await draft();

    const archived = await store.saveTome({ ...created, status: "Archived" });

    expect(archived.archivedAt).toBeTruthy();
  });

  it("keeps the original archive date across a later edit", async () => {
    const created = await draft();
    const archived = await store.saveTome({ ...created, status: "Archived" });

    const renamed = await store.saveTome({ ...archived, title: "Retitled" });

    // "Archived on" must name the day it was archived, not the day it was last
    // touched — otherwise editing an archived tome silently re-dates it.
    expect(renamed.archivedAt).toBe(archived.archivedAt);
    expect(renamed.updatedAt >= archived.updatedAt).toBe(true);
  });

  it("clears archivedAt when the tome comes back out of the archive", async () => {
    const created = await draft();
    const archived = await store.saveTome({ ...created, status: "Archived" });

    const revived = await store.saveTome({ ...archived, status: "Draft" });

    expect(revived.archivedAt).toBeUndefined();
  });

  it("leaves a tome that was never archived without a date", async () => {
    const completed = await draft({ status: "Completed" });

    expect(completed.archivedAt).toBeUndefined();
  });
});

describe("updateTome", () => {
  it("merges over what is stored, not over what the caller was holding", async () => {
    const created = await draft();

    // What the overview page does when two fields autosave a beat apart: the
    // second write never saw the first, and must not undo it.
    await store.updateTome(created.id, { subtitle: "Book One" });
    await store.updateTome(created.id, { description: plainToLexical("A war.") });

    const stored = (await db.tomes.get(created.id))!;
    expect(stored.subtitle).toBe("Book One");
    expect(stored.descriptionText).toBe("A war.");
    expect(stored.title).toBe("The Long Road");
  });

  it("derives the text mirror on every write", async () => {
    const created = await draft();

    const updated = await store.updateTome(created.id, {
      description: plainToLexical("A war, told sideways."),
    });

    expect(updated.descriptionText).toBe("A war, told sideways.");
  });

  it("clears a subtitle that was emptied, and a cover that was removed", async () => {
    const created = await draft({
      subtitle: "Book One",
      coverImage: { kind: "url", url: "https://example.invalid/cover.png" },
    });

    await store.updateTome(created.id, { subtitle: "  ", coverImage: undefined });

    const stored = (await db.tomes.get(created.id))!;
    expect(stored.subtitle).toBeUndefined();
    expect(stored.coverImage).toBeUndefined();
  });

  it("refuses a cleared title, leaving the row as it was", async () => {
    const created = await draft();

    await expect(store.updateTome(created.id, { title: "   " })).rejects.toThrow(
      /title is required/,
    );

    // The page renders that message inline, so the row behind it has to be the
    // one the author is still looking at.
    expect((await db.tomes.get(created.id))!.title).toBe("The Long Road");
  });

  it("stamps and keeps archivedAt the way saveTome does", async () => {
    const created = await draft();

    const archived = await store.updateTome(created.id, { status: "Archived" });
    const renamed = await store.updateTome(created.id, { title: "Retitled" });
    const revived = await store.updateTome(created.id, { status: "Draft" });

    expect(archived.archivedAt).toBeTruthy();
    // Archiving from the overview and archiving from anywhere else have to date
    // the book the same day, or "archived on…" depends on where it was done.
    expect(renamed.archivedAt).toBe(archived.archivedAt);
    expect(revived.archivedAt).toBeUndefined();
  });

  it("refuses a tome that is already gone", async () => {
    await expect(store.updateTome("nope", { title: "Ghost" })).rejects.toThrow(
      /no longer exists/,
    );
  });
});
