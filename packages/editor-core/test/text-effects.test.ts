import { describe, it, expect } from "vitest";
import { parse, serialize, signedIntToHex, hexToSignedInt } from "@youzign/designstring";
import {
  createTextItem,
  patchItem,
  textColorHex,
  TEXT_EFFECTS,
  textEffectPatch,
  detectTextEffect,
  type TextEffectId,
} from "../src/index.js";

const EMPTY =
  '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color"></data>';

const IDS: TextEffectId[] = ["none", "outline", "neon", "sticker", "hard-shadow", "echo"];

describe("text effects catalogue", () => {
  it("exposes six named chips", () => {
    expect(TEXT_EFFECTS.map((e) => e.id)).toEqual(IDS);
  });
});

describe("textEffectPatch — legacy attrs only", () => {
  const LEGAL = new Set([
    "isBorder",
    "borderSize",
    "borderColor",
    "isShadow",
    "shadowDistance",
    "shadowAngle",
    "shadowColor",
    "shadowOpacity",
    "isNoFill",
  ]);

  it("every effect writes ONLY known legacy border/shadow/fill attributes", () => {
    for (const id of IDS) {
      const patch = textEffectPatch(id, "#ff0000");
      for (const key of Object.keys(patch)) expect(LEGAL.has(key)).toBe(true);
    }
  });

  it("outline is hollow: colored ring in the text color + transparent fill", () => {
    const patch = textEffectPatch("outline", "#3366ff");
    expect(patch.isBorder).toBe(true);
    expect(patch.isNoFill).toBe(true);
    expect((patch.borderSize ?? 0) > 1).toBe(true);
    expect(signedIntToHex(patch.borderColor!)).toBe("#3366ff");
    expect(patch.isShadow).toBe(false);
  });

  it("neon is a centered colored glow (distance 0), no border/hollow", () => {
    const patch = textEffectPatch("neon", "#22d3ee");
    expect(patch.isShadow).toBe(true);
    expect(patch.shadowDistance).toBe(0);
    expect(signedIntToHex(patch.shadowColor!)).toBe("#22d3ee");
    expect(patch.isBorder).toBe(false);
    expect(patch.isNoFill).toBe(false);
  });

  it("sticker keeps fill: thick white ring + soft dark shadow", () => {
    const patch = textEffectPatch("sticker", "#f2585b");
    expect(patch.isBorder).toBe(true);
    expect((patch.borderSize ?? 0) >= 8).toBe(true);
    expect(signedIntToHex(patch.borderColor!)).toBe("#ffffff");
    expect(patch.isShadow).toBe(true);
    expect(patch.isNoFill).toBe(false);
  });

  it("hard-shadow is a solid offset shadow (opacity 1, distance > 0)", () => {
    const patch = textEffectPatch("hard-shadow", "#000000");
    expect(patch.isShadow).toBe(true);
    expect(patch.shadowOpacity).toBe(1);
    expect((patch.shadowDistance ?? 0) > 0).toBe(true);
    expect(patch.isBorder).toBe(false);
  });

  it("echo is a same-color half-opacity offset ghost", () => {
    const patch = textEffectPatch("echo", "#123456");
    expect(patch.isShadow).toBe(true);
    expect(patch.shadowOpacity).toBeLessThan(1);
    expect(signedIntToHex(patch.shadowColor!)).toBe("#123456");
  });

  it("none clears every effect surface", () => {
    const patch = textEffectPatch("none", "#000000");
    expect(patch.isBorder).toBe(false);
    expect(patch.isShadow).toBe(false);
    expect(patch.isNoFill).toBe(false);
  });
});

describe("apply → detect round-trip", () => {
  it("applying an effect and detecting it returns the same chip", () => {
    for (const id of IDS) {
      const d = parse(EMPTY);
      const item = createTextItem(d, 100, 100, { content: "Hi", color: "#e11d48" });
      patchItem(item as any, textEffectPatch(id, textColorHex(item)));
      expect(detectTextEffect(item as any)).toBe(id);
    }
  });
});

describe("effect items round-trip through the designstring", () => {
  it("a text item with an effect serializes and re-parses with attrs intact", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 100, 100, { content: "Glow", color: "#22d3ee" });
    patchItem(item as any, textEffectPatch("neon", textColorHex(item)));
    d.items.push(item);
    const round = parse(serialize(d));
    const back = round.items[round.items.length - 1] as any;
    expect(back.isShadow).toBe(true);
    expect(signedIntToHex(back.shadowColor)).toBe("#22d3ee");
    expect(detectTextEffect(back)).toBe("neon");
  });

  it("switching effects overwrites the previous effect cleanly (no stale border)", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 100, 100, { content: "X", color: "#000000" });
    patchItem(item as any, textEffectPatch("outline", textColorHex(item)));
    expect((item as any).isBorder).toBe(true);
    patchItem(item as any, textEffectPatch("hard-shadow", textColorHex(item)));
    expect((item as any).isBorder).toBe(false);
    expect((item as any).isNoFill).toBe(false);
    expect(detectTextEffect(item as any)).toBe("hard-shadow");
  });
});
