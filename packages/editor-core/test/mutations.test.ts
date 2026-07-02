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

describe("itemBox", () => {
  it("returns a center-based box for an image item", () => {
    const d = parse(XML);
    const img = d.items[0] as any;
    const box = itemBox(img);
    expect(box.cx).toBe(img.xpos);
    expect(box.w).toBe(img.width);
  });
});
