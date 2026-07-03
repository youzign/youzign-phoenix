import { describe, it, expect } from "vitest";
import {
  exportFilename,
  exportPageFilename,
  extensionFor,
  parsePageRange,
  scaledDimensions,
  pdfLayout,
  JPG_QUALITY,
  EXPORT_SCALES,
} from "../src/export/exportMath.js";

describe("extensionFor", () => {
  it("maps jpg format to jpg (not jpeg)", () => {
    expect(extensionFor("jpg")).toBe("jpg");
  });
  it("passes png and pdf through", () => {
    expect(extensionFor("png")).toBe("png");
    expect(extensionFor("pdf")).toBe("pdf");
  });
});

describe("exportFilename", () => {
  it("appends the extension to the design name", () => {
    expect(exportFilename("My Poster", "png")).toBe("My Poster.png");
    expect(exportFilename("My Poster", "jpg")).toBe("My Poster.jpg");
    expect(exportFilename("My Poster", "pdf")).toBe("My Poster.pdf");
  });
  it("falls back to 'design' for blank / whitespace names", () => {
    expect(exportFilename("", "png")).toBe("design.png");
    expect(exportFilename("   ", "pdf")).toBe("design.pdf");
    expect(exportFilename(undefined as unknown as string, "jpg")).toBe("design.jpg");
  });
  it("trims surrounding whitespace", () => {
    expect(exportFilename("  Flyer  ", "png")).toBe("Flyer.png");
  });
});

describe("exportPageFilename", () => {
  it("adds a one-based page number before the extension", () => {
    expect(exportPageFilename("Deck", "png", 3)).toBe("Deck-3.png");
    expect(exportPageFilename("", "pdf", 2)).toBe("design-2.pdf");
  });
});

describe("parsePageRange", () => {
  it("parses comma-separated pages and ranges as zero-based indices", () => {
    expect(parsePageRange("1-3,5", 6)).toEqual([0, 1, 2, 4]);
  });
  it("clamps out-of-bounds pages and removes duplicates", () => {
    expect(parsePageRange("0,2,2,4-9", 5)).toEqual([0, 1, 3, 4]);
  });
  it("accepts reversed ranges and ignores invalid tokens", () => {
    expect(parsePageRange("4-2, nope, 6", 4)).toEqual([1, 2, 3]);
  });
});

describe("scaledDimensions", () => {
  it("returns identity at 1x", () => {
    expect(scaledDimensions(800, 600, 1)).toEqual({ width: 800, height: 600 });
  });
  it("doubles pixel dimensions at 2x", () => {
    const one = scaledDimensions(800, 600, 1);
    const two = scaledDimensions(800, 600, 2);
    expect(two.width).toBe(one.width * 2);
    expect(two.height).toBe(one.height * 2);
  });
  it("scales up to 5x", () => {
    expect(scaledDimensions(400, 300, 5)).toEqual({ width: 2000, height: 1500 });
  });
  it("rounds fractional canvas dimensions", () => {
    expect(scaledDimensions(100.4, 100.6, 3)).toEqual({ width: 301, height: 302 });
  });
});

describe("pdfLayout", () => {
  it("chooses landscape for wide canvases", () => {
    const l = pdfLayout(1200, 800);
    expect(l.orientation).toBe("landscape");
    expect(l.format).toEqual([800, 1200]);
    expect(l.imageWidth).toBe(1200);
    expect(l.imageHeight).toBe(800);
  });
  it("chooses portrait for tall canvases", () => {
    const p = pdfLayout(800, 1200);
    expect(p.orientation).toBe("portrait");
    expect(p.format).toEqual([800, 1200]);
  });
  it("defaults square canvases to portrait", () => {
    const s = pdfLayout(1000, 1000);
    expect(s.orientation).toBe("portrait");
    expect(s.format).toEqual([1000, 1000]);
  });
  it("uses px units and full-bleed image dimensions", () => {
    const l = pdfLayout(640, 480);
    expect(l.unit).toBe("px");
    expect(l.imageWidth).toBe(640);
    expect(l.imageHeight).toBe(480);
  });
});

describe("constants", () => {
  it("keeps legacy JPG quality at 0.95", () => {
    expect(JPG_QUALITY).toBe(0.95);
  });
  it("exposes 1x-5x scale options", () => {
    expect(EXPORT_SCALES).toEqual([1, 2, 3, 4, 5]);
  });
});
