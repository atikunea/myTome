import { describe, it, expect } from "vitest";
import { db } from "../../models/db";
import { store } from "../store";

/**
 * `saveTome`, and in particular `archivedAt`, which is the one field on a tome
 * that is derived rather than given: the library shows "archived on…", so the
 * date has to be the day the author archived the book and not the day they last
 * touched it. It sticks across later edits and clears when the book comes back
 * out — neither of which the caller says anything about.
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
    expect(tome.description).toBe("west");
    // Stored as absent rather than as "", so `subtitle && …` renders nothing.
    expect(tome.subtitle).toBeUndefined();
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
