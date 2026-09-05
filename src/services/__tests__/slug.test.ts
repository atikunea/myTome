import { describe, it, expect } from "vitest";
import { slugify } from "../slug";

/**
 * The one slug rule. It had three copies — an element type's `slug`, a backup
 * file's name, a manuscript export's name — differing only in what an
 * unsluggable string falls back to, which is why the fallback is a parameter
 * rather than three near-identical regex pairs.
 */

describe("slugify", () => {
  it("lowercases and hyphenates a title", () => {
    expect(slugify("The Long Road")).toBe("the-long-road");
  });

  it("collapses runs of punctuation and spacing into one hyphen", () => {
    expect(slugify("Act I --- The  Gate!!")).toBe("act-i-the-gate");
  });

  it("trims the hyphens a leading or trailing symbol would leave", () => {
    expect(slugify("  ...Prologue...  ")).toBe("prologue");
  });

  it("drops characters no filename or URL should have to carry", () => {
    expect(slugify("Ash & Bel: a story/2")).toBe("ash-bel-a-story-2");
  });

  it("returns the fallback for a string with nothing sluggable in it", () => {
    // Every caller supplies a different one, which is the only thing that
    // differed between the three copies this replaced.
    expect(slugify("—", "type")).toBe("type");
    expect(slugify("", "tome")).toBe("tome");
    expect(slugify("!!!")).toBe("");
  });

  it("leaves an already-slugged string alone", () => {
    expect(slugify("the-long-road")).toBe("the-long-road");
  });
});
