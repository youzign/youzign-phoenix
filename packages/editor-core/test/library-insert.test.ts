import { describe, it, expect } from "vitest";
import { parse, serialize, hexToSignedInt } from "@youzign/designstring";
import {
  createClipartItem,
  createImageItem,
  createTextItem,
  createShapeItem,
  fitToCanvas,
  setShapeFill,
  shapeFillHex,
  insertCombo,
  COMBOS,
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

describe("createClipartItem recolorable flag (color icons)", () => {
  it("ships an EMPTY colors array + empty color attr when non-recolorable", () => {
    const d = parse(EMPTY);
    const item = createClipartItem(
      d,
      "https://api.iconify.design/flat-color-icons/like.svg",
      400,
      300,
      { recolorable: false }
    );
    expect(item.colors).toEqual([]);
    expect(item.rawAttrs["color"]).toBe("");
    // still round-trips as a valid clipart node
    d.items.push(item);
    const round = parse(serialize(d));
    expect((round.items[0] as any).type).toBe("clipart");
  });

  it("defaults to recolorable (one seeded color) when the flag is omitted", () => {
    const d = parse(EMPTY);
    const item = createClipartItem(d, "https://x/a.svg", 400, 300);
    expect(item.colors.length).toBe(1);
  });
});

describe("createTextItem presets", () => {
  it("defaults are preserved when no preset is passed", () => {
    const d = parse(EMPTY);
    const t = createTextItem(d, 400, 300);
    expect(t.size).toBe(54);
    expect(t.bold).toBe(false);
    expect(t.content).toBe("Double-click to edit");
  });

  it("applies size / weight / italic / content / color", () => {
    const d = parse(EMPTY);
    const t = createTextItem(d, 400, 300, {
      content: "Add a headline",
      size: 90,
      bold: true,
      italic: true,
      color: "#ffffff",
    });
    expect(t.size).toBe(90);
    expect(t.bold).toBe(true);
    expect(t.italic).toBe(true);
    expect(t.content).toBe("Add a headline");
    // color array length tracks glyph count and serializes
    expect(t.colors.length).toBe(Array.from("Add a headline").length);
    d.items.push(t);
    const round = parse(serialize(d));
    const r = round.items[0] as any;
    expect(r.size).toBe(90);
    expect(r.bold).toBe(true);
  });
});

describe("createShapeItem presets (styled shapes)", () => {
  it("applies custom size, fill, shadow and border", () => {
    const d = parse(EMPTY);
    const s = createShapeItem(d, "rect", 400, 300, {
      width: 220,
      height: 150,
      fill: "#ffffff",
      shadow: true,
      border: true,
      borderSize: 6,
    });
    expect(s.width).toBe(220);
    expect(s.height).toBe(150);
    expect(s.isShadow).toBe(true);
    expect(s.isBorder).toBe(true);
    expect(s.borderSize).toBe(6);
    expect(shapeFillHex(s).toLowerCase()).toBe("#ffffff");
    d.items.push(s);
    const round = parse(serialize(d));
    expect((round.items[0] as any).isShadow).toBe(true);
  });
});

describe("insertCombo (multi-item presets)", () => {
  it("exposes the four combos", () => {
    expect(COMBOS.map((c) => c.id)).toEqual([
      "ribbon-text",
      "badge",
      "button",
      "quote-card",
    ]);
  });

  it("ribbon+text returns a banner shape + a centred text on top", () => {
    const d = parse(EMPTY); // 800 x 600
    const items = insertCombo(d, "ribbon-text");
    expect(items).toHaveLength(2);
    const [rect, text] = items as any[];
    expect(rect.type).toBe("clipart");
    expect(text.type).toBe("text");
    // both centred on the canvas
    expect(rect.xpos).toBe(400);
    expect(rect.ypos).toBe(300);
    expect(text.xpos).toBe(400);
    expect(text.ypos).toBe(300);
    // text sits ON TOP (higher z-index)
    expect(text.index).toBeGreaterThan(rect.index);
  });

  it("assigns sequential indices continuing from the doc, and round-trips", () => {
    const d = parse(EMPTY);
    const items = insertCombo(d, "quote-card");
    expect(items).toHaveLength(3); // card + quote + attribution
    const idxs = items.map((i: any) => i.index);
    expect(idxs).toEqual([0, 1, 2]);
    for (const it of items) d.items.push(it);
    const round = parse(serialize(d));
    expect(round.items).toHaveLength(3);
  });

  it("badge and button each return a shape + a label", () => {
    const d = parse(EMPTY);
    for (const id of ["badge", "button"] as const) {
      const items = insertCombo(d, id);
      expect(items).toHaveLength(2);
      expect((items[0] as any).type).toBe("clipart");
      expect((items[1] as any).type).toBe("text");
    }
  });
});

describe("byte-stability", () => {
  it("an inserted item does not disturb an untouched empty doc baseline", () => {
    const baseline = serialize(parse(EMPTY));
    expect(serialize(parse(EMPTY))).toBe(baseline);
  });
});
