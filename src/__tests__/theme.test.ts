import { describe, it, expect } from "vitest";
import { dotColor, getTheme } from "../theme";
import { plotDotColors, type PlotDotColor } from "../models/Plot";

describe("dotColor", () => {
  const thread = "#123456";

  it("draws every named colour distinctly, in both modes", () => {
    for (const mode of ["dark", "light"] as const) {
      const theme = getTheme(mode);
      const drawn = plotDotColors.map((color) => dotColor(theme, color, thread));
      expect(new Set(drawn).size).toBe(plotDotColors.length);
    }
  });

  it("draws grey, no colour and an unknown name in the thread", () => {
    const theme = getTheme("dark");
    expect(dotColor(theme, "grey", thread)).toBe(thread);
    expect(dotColor(theme, undefined, thread)).toBe(thread);
    // A colour a newer build added, arriving in a backup or a sync.
    expect(dotColor(theme, "teal" as PlotDotColor, thread)).toBe(thread);
  });
});
