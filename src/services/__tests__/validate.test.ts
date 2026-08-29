import { describe, it, expect } from "vitest";
import {
  validateElement,
  validateFields,
  validatePlotItem,
  validateRelationship,
} from "../store";
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

  it("enforces required fields but tolerates blank optional ones", () => {
    const fields = [field({ required: true })];
    expect(() => validateElement("Ash", { f1: " " }, fields)).toThrow(/Age is required/);
    expect(() => validateElement("Ash", {}, [field()])).not.toThrow();
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
