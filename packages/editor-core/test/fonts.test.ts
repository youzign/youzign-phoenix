import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse, serialize } from "@youzign/designstring";
import {
  GOOGLE_FONTS,
  EXTERNAL_FONT,
  fontPatch,
  familyToParam,
  googleFontsHref,
  patchItem,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(__dirname, "../../../apps/editor/src/fixtures/mountains-input.xml");
const XML = readFileSync(fixture, "utf8");

describe("curated font list", () => {
  it("includes key families, is large, sorted, and unique", () => {
    expect(GOOGLE_FONTS).toContain("Arvo");
    expect(GOOGLE_FONTS).toContain("Inter");
    expect(GOOGLE_FONTS.length).toBeGreaterThanOrEqual(250);
    expect(new Set(GOOGLE_FONTS).size).toBe(GOOGLE_FONTS.length);
    expect(GOOGLE_FONTS).toEqual([...GOOGLE_FONTS].sort((a, b) => a.localeCompare(b)));
  });
});

describe("font field mapping", () => {
  it("fontPatch writes family + External Font type", () => {
    expect(fontPatch("Open Sans")).toEqual({
      font: "Open Sans",
      fontType: EXTERNAL_FONT,
    });
  });

  it("patchItem applies the font patch and round-trips faithfully", () => {
    const d = parse(XML);
    const t = d.items.find((i) => i.type === "text") as any;
    patchItem(t, fontPatch("Montserrat"));
    expect(t.font).toBe("Montserrat");
    expect(t.fontType).toBe(EXTERNAL_FONT);
    const round = parse(serialize(d));
    const rt = round.items.find((i) => i.type === "text") as any;
    expect(rt.font).toBe("Montserrat");
    expect(rt.fontType).toBe(EXTERNAL_FONT);
    expect(rt.rawAttrs.font).toBe("Montserrat");
    expect(rt.rawAttrs.fontType).toBe(EXTERNAL_FONT);
  });

  it("changing one item's font leaves every other item byte-identical", () => {
    const before = parse(XML);
    const after = parse(XML);
    patchItem(after.items[1] as any, fontPatch("Lato"));
    const bLines = serialize(before).split("\n");
    const aLines = serialize(after).split("\n");
    expect(aLines.length).toBe(bLines.length);
    const diffs = aLines.filter((l, i) => l !== bLines[i]);
    expect(diffs.length).toBe(1);
    expect(diffs[0]).toContain('font="Lato"');
  });
});

describe("google fonts css url", () => {
  it("encodes spaces and requests regular + bold", () => {
    expect(familyToParam("Open Sans")).toBe("Open+Sans:wght@400;700");
  });

  it("builds a stable, de-duplicated css2 href", () => {
    const href = googleFontsHref(["Arvo", "Arvo", "Open Sans"]);
    expect(href).toBe(
      "https://fonts.googleapis.com/css2?family=Arvo:wght@400;700&family=Open+Sans:wght@400;700&display=swap"
    );
  });

  it("returns null for an empty list", () => {
    expect(googleFontsHref([])).toBeNull();
    expect(googleFontsHref(["", "  "])).toBeNull();
  });
});
