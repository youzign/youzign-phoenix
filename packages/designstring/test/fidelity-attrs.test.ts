import { describe, it, expect } from "vitest";
import { parse, serialize } from "../src/index.js";
import type { ImageItem } from "../src/index.js";

const XML =
  `<?xml version="1.0" encoding="utf-8"?>\n` +
  `<data template_type="social" canvas_width="800" canvas_height="600">\n` +
  `  <item type="image" index="0" xpos="100" ypos="100" width="200" height="200" ` +
  `source="a.png" blendMode="multiply" isInvert="true" invertIntensity="80" ` +
  `isCornerRadiusIndividual="true" inputCornerTopLeft="10" inputCornerTopRight="20" ` +
  `inputCornerBottomLeft="30" inputCornerBottomRight="40"/>\n` +
  `  <item type="filter" filterid="8" opacity="0.5"/>\n` +
  `</data>\n`;

describe("legacy fidelity attributes: blend / invert / corner radius / filter", () => {
  it("parses the new per-item attributes into typed fields", () => {
    const d = parse(XML);
    const img = d.items[0] as ImageItem;
    expect(img.blendMode).toBe("multiply");
    expect(img.isInvert).toBe(true);
    expect(img.invertIntensity).toBe(80);
    expect(img.isCornerRadiusIndividual).toBe(true);
    expect(img.inputCornerTopLeft).toBe(10);
    expect(img.inputCornerBottomRight).toBe(40);
  });

  it("defaults: blendMode=normal, invertIntensity=100 when absent", () => {
    const d = parse(
      `<data canvas_width="10" canvas_height="10">` +
        `<item type="image" index="0" source="x.png"/></data>`
    );
    const img = d.items[0] as ImageItem;
    expect(img.blendMode).toBe("normal");
    expect(img.invertIntensity).toBe(100);
    expect(img.isInvert).toBe(false);
    expect(img.inputCornerTopLeft).toBe(0);
  });

  it("round-trips byte-stable (attrs are not dropped or reordered)", () => {
    expect(serialize(parse(XML))).toBe(XML);
  });

  it("filter item keeps filterid + opacity", () => {
    const d = parse(XML);
    const f = d.items[1] as any;
    expect(f.type).toBe("filter");
    expect(f.filterid).toBe(8);
    expect(f.opacity).toBe(0.5);
  });
});
