import { describe, expect, it, vi, afterEach } from "vitest";
import { extractPastedImageFiles, isTextEditingContext } from "../src/paste.js";

function fakeFile(type: string): File {
  // jsdom-less "node" test environment: a minimal File-shaped stand-in is
  // enough since extractPastedImageFiles only reads `.type`.
  return { type } as unknown as File;
}

describe("isTextEditingContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true when a canvas text item is mid-edit (editingUid set)", () => {
    expect(isTextEditingContext({ target: null, editingUid: 7 })).toBe(true);
  });

  it("is false when nothing indicates text editing", () => {
    expect(isTextEditingContext({ target: null, editingUid: null })).toBe(false);
  });

  it("is true when the event target is an INPUT", () => {
    const target = { tagName: "INPUT" } as unknown as EventTarget;
    expect(isTextEditingContext({ target, editingUid: null })).toBe(true);
  });

  it("is true when the event target is a TEXTAREA", () => {
    const target = { tagName: "TEXTAREA" } as unknown as EventTarget;
    expect(isTextEditingContext({ target, editingUid: null })).toBe(true);
  });

  it("is true when the event target is contenteditable", () => {
    const target = { tagName: "DIV", isContentEditable: true } as unknown as EventTarget;
    expect(isTextEditingContext({ target, editingUid: null })).toBe(true);
  });

  it("is false for an ordinary element target", () => {
    const target = { tagName: "DIV", isContentEditable: false } as unknown as EventTarget;
    expect(isTextEditingContext({ target, editingUid: null })).toBe(false);
  });

  it("falls back to document.activeElement when the target itself isn't a typing element", () => {
    vi.stubGlobal("document", { activeElement: { tagName: "INPUT" } });
    const target = { tagName: "DIV" } as unknown as EventTarget;
    expect(isTextEditingContext({ target, editingUid: null })).toBe(true);
  });
});

describe("extractPastedImageFiles", () => {
  it("returns [] for null/undefined clipboard data", () => {
    expect(extractPastedImageFiles(null)).toEqual([]);
    expect(extractPastedImageFiles(undefined)).toEqual([]);
  });

  it("returns [] when clipboard data has neither files nor items", () => {
    expect(extractPastedImageFiles({})).toEqual([]);
  });

  it("pulls image files from `files`, ignoring non-image ones", () => {
    const png = fakeFile("image/png");
    const txt = fakeFile("text/plain");
    const result = extractPastedImageFiles({ files: [png, txt] });
    expect(result).toEqual([png]);
  });

  it("pulls image files from `items` via getAsFile, ignoring non-file/non-image items", () => {
    const png = fakeFile("image/png");
    const items = [
      { kind: "file", type: "image/png", getAsFile: () => png },
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "text/plain", getAsFile: () => fakeFile("text/plain") },
    ];
    const result = extractPastedImageFiles({ items });
    expect(result).toEqual([png]);
  });

  it("handles multiple pasted images from items", () => {
    const a = fakeFile("image/png");
    const b = fakeFile("image/jpeg");
    const items = [
      { kind: "file", type: "image/png", getAsFile: () => a },
      { kind: "file", type: "image/jpeg", getAsFile: () => b },
    ];
    expect(extractPastedImageFiles({ items })).toEqual([a, b]);
  });

  it("de-duplicates a file reported in both `files` and `items`", () => {
    const png = fakeFile("image/png");
    const items = [{ kind: "file", type: "image/png", getAsFile: () => png }];
    const result = extractPastedImageFiles({ files: [png], items });
    expect(result).toEqual([png]);
  });

  it("returns [] when an item's getAsFile returns null", () => {
    const items = [{ kind: "file", type: "image/png", getAsFile: () => null }];
    expect(extractPastedImageFiles({ items })).toEqual([]);
  });
});

describe("extractPastedImageFiles cross-list dedup", () => {
  it("dedups the same image exposed as distinct File instances in files and items", () => {
    const a = new File([new Uint8Array(4)], "shot.png", { type: "image/png", lastModified: 111 });
    const b = new File([new Uint8Array(4)], "shot.png", { type: "image/png", lastModified: 111 });
    const files = extractPastedImageFiles({
      files: [a],
      items: [{ kind: "file", type: "image/png", getAsFile: () => b }],
    });
    expect(files).toHaveLength(1);
  });

  it("keeps genuinely different images from both lists", () => {
    const a = new File([new Uint8Array(4)], "one.png", { type: "image/png", lastModified: 111 });
    const b = new File([new Uint8Array(9)], "two.png", { type: "image/png", lastModified: 222 });
    const files = extractPastedImageFiles({
      files: [a],
      items: [{ kind: "file", type: "image/png", getAsFile: () => b }],
    });
    expect(files).toHaveLength(2);
  });
});
