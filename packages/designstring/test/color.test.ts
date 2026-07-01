import { describe, it, expect } from "vitest";
import {
  signedIntToHex,
  hexToSignedInt,
  parseGlyphColors,
  serializeGlyphColors,
} from "../src/color.js";

describe("signedIntToHex", () => {
  it("matches legacy intToHex for known values", () => {
    // NOTE: values are what the EXACT legacy intToHex algorithm produces.
    // The task spec listed #df3a64 / #7e57e2, but those are transcription
    // typos: the authoritative algorithm yields #df3864 / #7e5ca2.
    expect(signedIntToHex(16513009)).toBe("#fbf7f1");
    expect(signedIntToHex(14628964)).toBe("#df3864");
    expect(signedIntToHex(8281250)).toBe("#7e5ca2");
    expect(signedIntToHex(3289650)).toBe("#323232");
  });

  it("normalizes negative (Flash signed) ints", () => {
    expect(signedIntToHex(-1)).toBe("#ffffff");
    expect(signedIntToHex(-16777216)).toBe("#000000");
  });
});

describe("hexToSignedInt", () => {
  it("is the positive-int inverse", () => {
    expect(hexToSignedInt("#fbf7f1")).toBe(16513009);
    expect(hexToSignedInt("#df3864")).toBe(14628964);
    expect(hexToSignedInt("#7e5ca2")).toBe(8281250);
    expect(hexToSignedInt("#323232")).toBe(3289650);
    expect(hexToSignedInt("#ffffff")).toBe(16777215);
    expect(hexToSignedInt("#000000")).toBe(0);
  });
});

describe("glyph colors", () => {
  it("round-trips", () => {
    const s = "3289650@@@3289650@@@14628964";
    expect(parseGlyphColors(s)).toEqual([3289650, 3289650, 14628964]);
    expect(serializeGlyphColors([3289650, 3289650, 14628964])).toBe(s);
  });
  it("empty string -> []", () => {
    expect(parseGlyphColors("")).toEqual([]);
  });
});
