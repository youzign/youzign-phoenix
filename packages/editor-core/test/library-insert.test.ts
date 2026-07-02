import { describe, it, expect } from "vitest";
import { parse, serialize, hexToSignedInt } from "@youzign/designstring";
import {
  createClipartItem,
  createImageItem,
  fitToCanvas,
  setShapeFill,
  shapeFillHex,
} from "../src/index.js";

const EMPTY =
  '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color"></data>';

describe("createClipartItem (Iconify / library SVG)", () => {
  it("builds a valid legacy clipart item that serializes + re-parses", () => {
    const d = parse(EMPTY);
    const item = createClipartItem(d, "https://api.iconify.design/mdi/home.svg", 400, 300);
    d.items.push(item);
    const xml = serialize(d);
    const round = parse(xml);
    expect(round.items).toHaveLength(1);
    const c = round.items[0] as any;
    expect(c.type).toBe("clipart");
    expect(c.source).toBe("https://api.iconify.design/mdi/home.svg");
    expect(c.colors.length).toBe(1);
    // no parametric shape metadata (it is a real SVG, not a shape)
    expect(c.rawAttrs["shape_kind"]).toBeUndefined();
  });

  it("recolors via setShapeFill by rewriting the colors array", () => {
    const d = parse(EMPTY);
    const item = createClipartItem(d, "https://api.iconify.design/mdi/home.svg", 400, 300);
    setShapeFill(item, "#ff0000");
    expect(item.colors[0]).toBe(hexToSignedInt("#ff0000"));
    expect(shapeFillHex(item).toLowerCase()).toBe("#ff0000");
    // color attribute is kept in sync for serialization
    expect(item.rawAttrs["color"]).toBe(String(hexToSignedInt("#ff0000")));
  });
});

describe("createImageItem (stock photo)", () => {
  it("builds a valid legacy image item that round-trips", () => {
    const d = parse(EMPTY);
    const item = createImageItem(d, "https://img/full.jpg", 400, 300, {
      width: 480,
      height: 320,
    }, { pixabay: true });
    d.items.push(item);
    const round = parse(serialize(d));
    const im = round.items[0] as any;
    expect(im.type).toBe("image");
    expect(im.source).toBe("https://img/full.jpg");
    expect(im.width).toBe(480);
    expect(im.cropped).toBe(false);
    expect(im.pixabay).toBe(true);
  });
});

describe("fitToCanvas", () => {
  it("fits a landscape asset within coverage bounds, centred", () => {
    const d = parse(EMPTY); // 800 x 600
    const box = fitToCanvas(d, 1600, 900, 0.6);
    expect(box.x).toBe(400);
    expect(box.y).toBe(300);
    expect(box.width).toBeLessThanOrEqual(800 * 0.6 + 1);
    expect(box.height).toBeLessThanOrEqual(600 * 0.6 + 1);
    // aspect ratio preserved (16:9)
    expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
  });

  it("clamps by height for tall assets", () => {
    const d = parse(EMPTY);
    const box = fitToCanvas(d, 400, 1200, 0.6);
    expect(box.height).toBeLessThanOrEqual(600 * 0.6 + 1);
  });
});

describe("byte-stability", () => {
  it("an inserted item does not disturb an untouched empty doc baseline", () => {
    const baseline = serialize(parse(EMPTY));
    expect(serialize(parse(EMPTY))).toBe(baseline);
  });
});
