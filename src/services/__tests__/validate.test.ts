import { describe, it, expect } from "vitest";
import {
  isEmptyFieldValue,
  missingRequiredFields,
  validateElement,
  validateFields,
  validatePlotItem,
  validateRelationship,
} from "../store";
import { emptyProseDocument, plainToLexical } from "../../lexical/blocks";
import type { FieldDefinition } from "../../models/ElementType";

const field = (over: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id: "f1",
  name: "Age",
  kind: "text",
  required: false,
  sortOrder: 0,
  ...over,
});

describe("validateFields", () => {
  it("accepts a well-formed set", () => {
    expect(() =>
      validateFields([field(), field({ id: "f2", name: "Height" })]),
    ).not.toThrow();
  });

  it("rejects a blank or duplicate id", () => {
    expect(() => validateFields([field({ id: " " })])).toThrow(/unique identifier/);
    expect(() => validateFields([field(), field({ name: "Other" })])).toThrow(
      /unique identifier/,
    );
  });

  it("rejects blank and case-insensitively duplicate names", () => {
    expect(() => validateFields([field({ name: "  " })])).toThrow(/unique and not blank/);
    expect(() =>
      validateFields([field(), field({ id: "f2", name: "AGE" })]),
    ).toThrow(/unique and not blank/);
  });

  it("requires a select to carry unique, non-blank choices", () => {
    expect(() => validateFields([field({ kind: "select" })])).toThrow(/list choices/);
    expect(() =>
      validateFields([field({ kind: "select", options: ["  ", ""] })]),
    ).toThrow(/list choices/);
    expect(() =>
      validateFields([field({ kind: "select", options: ["Red", "red"] })]),
    ).toThrow(/list choices/);
    expect(() =>
      validateFields([field({ kind: "select", options: ["Red", "Blue"] })]),
    ).not.toThrow();
  });
});

describe("validateElement", () => {
  it("requires a name", () => {
    expect(() => validateElement("  ", {}, [])).toThrow(/Name is required/);
  });

  it("does not enforce required fields — that is completeness, not validity", () => {
    // Editing is per field now: throwing here would throw away the edit the
    // author just made because some *other* field is still empty.
    const fields = [field({ required: true })];
    expect(() => validateElement("Ash", { f1: " " }, fields)).not.toThrow();
    expect(missingRequiredFields({ f1: " " }, fields)).toHaveLength(1);
    expect(missingRequiredFields({ f1: "34" }, fields)).toHaveLength(0);
    expect(missingRequiredFields({}, [field()])).toHaveLength(0);
  });

  it("reads a prose field's emptiness from its text, not its string", () => {
    const prose = field({ kind: "prose", required: true });
    // An empty document is several hundred characters of JSON, so the naive
    // check would call every blank prose field filled in.
    expect(emptyProseDocument.trim().length).toBeGreaterThan(0);
    expect(isEmptyFieldValue(prose, emptyProseDocument)).toBe(true);
    expect(isEmptyFieldValue(prose, plainToLexical("  "))).toBe(true);
    expect(isEmptyFieldValue(prose, plainToLexical("Tall, and stooped."))).toBe(false);
    expect(isEmptyFieldValue(prose, undefined)).toBe(true);
    expect(missingRequiredFields({ f1: emptyProseDocument }, [prose])).toHaveLength(1);
  });

  it("holds a select value to its listed choices", () => {
    const fields = [field({ kind: "select", options: ["Red", "Blue"] })];
    expect(() => validateElement("Ash", { f1: "Green" }, fields)).toThrow(/listed choice/);
    expect(() => validateElement("Ash", { f1: "Red" }, fields)).not.toThrow();
  });
});

describe("validatePlotItem", () => {
  it("requires a title", () => {
    expect(() => validatePlotItem(" ")).toThrow(/needs a title/);
    expect(() => validatePlotItem("The duel")).not.toThrow();
  });
});

describe("validateRelationship", () => {
  it("requires a label and rejects a self-link", () => {
    expect(() => validateRelationship("a", "b", " ")).toThrow(/needs a description/);
    expect(() => validateRelationship("a", "a", "sibling")).toThrow(/related to itself/);
    expect(() => validateRelationship("a", "b", "sibling")).not.toThrow();
  });
});
