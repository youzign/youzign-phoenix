import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse, serialize, signedIntToHex } from "@youzign/designstring";
import {
  patchItem,
  setTextColor,
  createTextItem,
  createShapeItem,
  setShapeFill,
  isShape,
  itemBox,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(__dirname, "../../../apps/editor/src/fixtures/mountains-input.xml");
const XML = readFileSync(fixture, "utf8");

describe("fidelity guard: no-op export equals parse->serialize baseline", () => {
  it("opening a fixture and making no edits round-trips byte-stable", () => {
    const baseline = serialize(parse(XML));
    const design = parse(XML);
    expect(serialize(design)).toBe(baseline);
  });
});

describe("edits only touch the edited item", () => {
  it("moving one item leaves every other item's serialized attrs identical", () => {
    const before = parse(XML);
    const after = parse(XML);
    // move item index 1 (a text item)
    patchItem(after.items[1] as any, { xpos: 999, ypos: 42 });

    const bLines = serialize(before).split("\n");
    const aLines = serialize(after).split("\n");
    expect(aLines.length).toBe(bLines.length);
    const diffs = aLines.filter((l, i) => l !== bLines[i]);
    // Exactly one line (the edited item) changed.
    expect(diffs.length).toBe(1);
    expect(diffs[0]).toContain('xpos="999"');
    expect(diffs[0]).toContain('ypos="42"');
  });

  it("patchItem keeps rawAttrs and typed field in sync", () => {
    const d = parse(XML);
    patchItem(d.items[0] as any, { rotation: 12.5, opacity: 0.5 });
    const round = parse(serialize(d));
    expect((round.items[0] as any).rotation).toBe(12.5);
    expect((round.items[0] as any).opacity).toBe(0.5);
  });
});

describe("text recolor collapses per-glyph array to uniform", () => {
  it("preserves array length, sets all glyphs to the new color", () => {
    const d = parse(XML);
    const t = d.items.find((i) => i.type === "text") as any;
    const before = t.colors.length;
    setTextColor(t, "#ff0000");
    expect(t.colors.length).toBe(before);
    expect(t.colors.every((c: number) => signedIntToHex(c) === "#ff0000")).toBe(true);
    // survives round-trip
    const round = parse(serialize(d));
    const rt = round.items.find((i) => i.type === "text") as any;
    expect(rt.colors.every((c: number) => signedIntToHex(c) === "#ff0000")).toBe(true);
  });
});

describe("new items serialize to valid designstring", () => {
  it("added text item round-trips as a text node", () => {
    const d = parse(XML);
    const before = d.items.length;
    d.items.push(createTextItem(d, 300, 300));
    const round = parse(serialize(d));
    expect(round.items.length).toBe(before + 1);
    const added = round.items[round.items.length - 1] as any;
    expect(added.type).toBe("text");
    expect(added.content).toBe("Double-click to edit");
    expect(added.xpos).toBe(300);
  });

  it("fresh text item is born with the canonical derived text-area height", async () => {
    const { derivedTextAreaHeight } = await import("../src/text-bounds.js");
    const d = parse(XML);
    const t = createTextItem(d, 300, 300, { size: 90 }) as any;
    // creation must match what syncTextAreaHeight derives — a mismatch renders
    // fresh text at the wrong scale until the first gesture re-syncs it
    expect(t.mcHeight).toBe(derivedTextAreaHeight(t));
    expect(t.textAreaHeight).toBe(t.mcHeight);
    expect(t.textAreaypos).toBe(-t.mcHeight / 2);
  });

  it("added shape is a clipart with an inline svg source and recolors", () => {
    const d = parse(XML);
    const shape = createShapeItem(d, "star", 400, 400);
    d.items.push(shape);
    expect(isShape(shape)).toBe(true);
    setShapeFill(shape, "#00ff00");
    const round = parse(serialize(d));
    const added = round.items[round.items.length - 1] as any;
    expect(added.type).toBe("clipart");
    expect(added.rawAttrs.shape_kind).toBe("star");
    expect(added.rawAttrs.shape_fill).toBe("#00ff00");
    expect(added.source.startsWith("data:image/svg+xml,")).toBe(true);
  });
});

describe("effects: shadow / border / blur attribute mapping", () => {
  it("patching effect fields writes the exact legacy attributes", () => {
    const d = parse(XML);
    const it = d.items[1] as any;
    patchItem(it, {
      isShadow: true,
      shadowDistance: 8,
      shadowAngle: 30,
      shadowColor: -16777216,
      shadowOpacity: 0.5,
      isBorder: true,
      borderSize: 4,
      borderColor: -1,
      isBlur: true,
      blurSize: 6,
    });
    expect(it.rawAttrs.is_shadow).toBe("true");
    expect(it.rawAttrs.shadow_distance).toBe("8");
    expect(it.rawAttrs.shadow_angle).toBe("30");
    expect(it.rawAttrs.shadow_color).toBe("-16777216");
    expect(it.rawAttrs.shadow_opacity).toBe("0.5");
    expect(it.rawAttrs.is_border).toBe("true");
    expect(it.rawAttrs.border_size).toBe("4");
    expect(it.rawAttrs.border_color).toBe("-1");
    expect(it.rawAttrs.is_blur).toBe("true");
    expect(it.rawAttrs.blur_size).toBe("6");
    // typed view stays in sync
    expect(it.isShadow).toBe(true);
    expect(it.borderColor).toBe(-1);
  });

  it("effect edits round-trip and touch only the edited item's line", () => {
    const before = parse(XML);
    const after = parse(XML);
    patchItem(after.items[1] as any, { isShadow: true, shadowDistance: 12 });
    const bLines = serialize(before).split("\n");
    const aLines = serialize(after).split("\n");
    expect(aLines.length).toBe(bLines.length);
    expect(aLines.filter((l, i) => l !== bLines[i]).length).toBe(1);
    // and parse(serialize()) preserves the new values
    const round = parse(serialize(after)).items[1] as any;
    expect(round.isShadow).toBe(true);
    expect(round.shadowDistance).toBe(12);
  });
});

describe("blend / invert / corner-radius patch → exact legacy attribute names", () => {
  it("writes blendMode, isInvert, invertIntensity and corner attrs verbatim", () => {
    const d = parse(XML);
    const img = d.items.find((i) => i.type === "image") as any;
    patchItem(img, {
      blendMode: "screen",
      isInvert: true,
      invertIntensity: 60,
      inputCornerTopLeft: 12,
      isCornerRadiusIndividual: true,
    });
    expect(img.rawAttrs.blendMode).toBe("screen");
    expect(img.rawAttrs.isInvert).toBe("true");
    expect(img.rawAttrs.invertIntensity).toBe("60");
    expect(img.rawAttrs.inputCornerTopLeft).toBe("12");
    expect(img.rawAttrs.isCornerRadiusIndividual).toBe("true");
    // survives a serialize→parse round-trip
    const round = parse(serialize(d)).items.find((i) => i.type === "image") as any;
    expect(round.blendMode).toBe("screen");
    expect(round.invertIntensity).toBe(60);
    expect(round.inputCornerTopLeft).toBe(12);
  });
});

describe("itemBox", () => {
  it("returns a center-based box for an image item", () => {
    const d = parse(XML);
    const img = d.items[0] as any;
    const box = itemBox(img);
    expect(box.cx).toBe(img.xpos);
    expect(box.w).toBe(img.width);
  });
});
