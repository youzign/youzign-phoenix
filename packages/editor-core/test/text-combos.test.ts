import { describe, it, expect } from "vitest";
import { parse, serialize } from "@youzign/designstring";
import {
  FONT_COMBOS,
  GOOGLE_FONTS,
  fontComboFamilies,
  insertFontCombo,
  getFontCombo,
  detectTextEffect,
} from "../src/index.js";

const EMPTY =
  '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color"></data>';

describe("FONT_COMBOS catalogue", () => {
  it("ships a rich set (>= 12) with unique ids and 1–2 layers each", () => {
    expect(FONT_COMBOS.length).toBeGreaterThanOrEqual(12);
    const ids = FONT_COMBOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of FONT_COMBOS) {
      expect(c.layers.length).toBeGreaterThanOrEqual(1);
      expect(c.layers.length).toBeLessThanOrEqual(2);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("every layer font is in the picker's GOOGLE_FONTS list", () => {
    for (const c of FONT_COMBOS)
      for (const l of c.layers) {
        expect(l.font).toBeTruthy();
        expect(GOOGLE_FONTS).toContain(l.font!);
      }
  });

  it("fontComboFamilies dedupes to the fonts actually used", () => {
    const fams = fontComboFamilies();
    expect(new Set(fams).size).toBe(fams.length);
    for (const c of FONT_COMBOS)
      for (const l of c.layers) expect(fams).toContain(l.font);
  });
});

describe("insertFontCombo factory", () => {
  it("inserts positioned, sequential text layers for every combo", () => {
    for (const combo of FONT_COMBOS) {
      const d = parse(EMPTY);
      const items = insertFontCombo(d, combo.id);
      expect(items.length).toBe(combo.layers.length);
      // all text, centred horizontally on an 800-wide canvas
      for (const it of items) {
        expect(it.type).toBe("text");
        expect((it as any).xpos).toBe(400);
      }
      // sequential z-index
      const idx = items.map((it) => (it as any).index);
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1] + 1);
    }
  });

  it("applies the declared effect to the right layer", () => {
    const d = parse(EMPTY);
    const items = insertFontCombo(d, "outline"); // single hollow-outline layer
    expect(detectTextEffect(items[0] as any)).toBe("outline");
  });

  it("produced items serialize + re-parse cleanly (round-trip)", () => {
    const d = parse(EMPTY);
    for (const it of insertFontCombo(d, "quote")) d.items.push(it as any);
    const round = parse(serialize(d));
    expect(round.items.length).toBe(2);
    for (const it of round.items) expect(it.type).toBe("text");
  });

  it("returns [] for an unknown combo id", () => {
    const d = parse(EMPTY);
    expect(insertFontCombo(d, "does-not-exist")).toEqual([]);
    expect(getFontCombo("does-not-exist")).toBeUndefined();
  });
});
