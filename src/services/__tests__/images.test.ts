import { describe, it, expect, vi, afterEach } from "vitest";
import { imageFrom, imageHref } from "../store";

/**
 * Cover art and portraits. Small, but `imageFrom` is the app's only URL
 * gatekeeper: a cover is rendered into the page, so the scheme it is allowed to
 * carry is a security decision and not a formatting one.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("imageFrom", () => {
  it("prefers an uploaded file over whatever is in the URL box", async () => {
    const file = new File(["bytes"], "cover.png", { type: "image/png" });

    const image = await imageFrom("https://example.com/other.png", file);

    // The picker leaves the last-typed URL in the field when the author then
    // browses for a file; the file is the newer intent.
    expect(image).toEqual({ kind: "local", blob: file });
  });

  it("keeps an https URL as a link, normalized", async () => {
    expect(await imageFrom("  https://example.com/cover.png  ")).toEqual({
      kind: "url",
      url: "https://example.com/cover.png",
    });
  });

  it("means 'no image' by an empty box, rather than throwing", async () => {
    expect(await imageFrom("   ")).toBeUndefined();
  });

  it("refuses http, so a cover cannot be fetched in the clear", async () => {
    await expect(imageFrom("http://example.com/cover.png")).rejects.toThrow(/https/);
  });

  it("refuses javascript: and data: URLs", async () => {
    // Both parse as URLs, so only the protocol check stands between them and an
    // `<img src>` — and the page's CSP is the second line, not the first.
    await expect(imageFrom("javascript:alert(1)")).rejects.toThrow(/https/);
    await expect(imageFrom("data:image/png;base64,AAAA")).rejects.toThrow(/https/);
  });

  it("refuses text that is not a URL at all", async () => {
    await expect(imageFrom("not a url")).rejects.toThrow();
  });
});

describe("imageHref", () => {
  it("hands back a url image's own address", () => {
    expect(imageHref({ kind: "url", url: "https://example.com/a.png" })).toBe(
      "https://example.com/a.png",
    );
  });

  it("has no address for an uploaded blob, and mints none", () => {
    // A Blob has no address until someone acquires one, and acquiring it here
    // would leak: the caller of a plain read has no reason to expect it owns a
    // revoke. hooks/useObjectUrl.ts is the only place that allocation happens.
    const createObjectURL = vi.fn(() => "blob:fake");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL }));
    const blob = new Blob(["bytes"], { type: "image/png" });

    expect(imageHref({ kind: "local", blob })).toBeUndefined();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("has nothing to show for an element that carries no image", () => {
    expect(imageHref(undefined)).toBeUndefined();
  });
});
