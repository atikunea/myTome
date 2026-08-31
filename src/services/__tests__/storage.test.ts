import { afterEach, describe, expect, it, vi } from "vitest";
import { persistStorage } from "../storage";

/**
 * `node` has no `navigator.storage`, so each case installs the shape it wants
 * to exercise. The behaviour worth pinning is the short-circuit: asking again
 * once the origin is already durable would re-prompt in Firefox for an answer
 * we already have.
 */
const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function withStorageManager(manager: unknown) {
  Object.defineProperty(globalThis, "navigator", {
    value: { storage: manager },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, "navigator", original);
  else Reflect.deleteProperty(globalThis, "navigator");
});

describe("persistStorage", () => {
  it("grants without asking again when the origin is already durable", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    withStorageManager({ persisted: vi.fn().mockResolvedValue(true), persist });

    await expect(persistStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("asks when the origin is not yet durable", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    withStorageManager({ persisted: vi.fn().mockResolvedValue(false), persist });

    await expect(persistStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("reports a refusal rather than throwing", async () => {
    withStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    });

    await expect(persistStorage()).resolves.toBe(false);
  });

  it("survives a browser that has no storage manager", async () => {
    withStorageManager(undefined);
    await expect(persistStorage()).resolves.toBe(false);
  });

  it("survives the request throwing", async () => {
    withStorageManager({
      persisted: vi.fn().mockRejectedValue(new Error("denied")),
      persist: vi.fn(),
    });

    await expect(persistStorage()).resolves.toBe(false);
  });
});
