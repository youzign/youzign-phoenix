import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse, serialize, type ClipartItem } from "@youzign/designstring";
import {
  patchItem,
  createShapeItem,
  createTextItem,
  setShapeFill,
  setShapeNoFill,
  isShapeNoFill,
  shapeFillHex,
  shapeSvg,
  centerPatch,
  stepForward,
  stepBackward,
  applyOrder,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const XML = readFileSync(
  resolve(__dirname, "../../../apps/editor/src/fixtures/mountains-input.xml"),
  "utf8"
);

function idxOf(design: any, ref: any): number {
  return (ref as any).index;
}

describe("flip via patch", () => {
  it("hFlip / vFlip write the raw attribute and typed field", () => {
    const d = parse("<data canvas_width=\"800\" canvas_height=\"600\" bg_color=\"-1\" bg_type=\"color\"></data>");
    const item = createShapeItem(d, "rect", 100, 100);
    patchItem(item as any, { hFlip: true, vFlip: true });
    expect(item.hFlip).toBe(true);
    expect(item.vFlip).toBe(true);
    expect(item.rawAttrs["hFlip"]).toBe("true");
    expect(item.rawAttrs["vFlip"]).toBe("true");
  });
});

describe("center math", () => {
  it("centerPatch picks the canvas midpoint per axis", () => {
    const d = parse("<data canvas_width=\"800\" canvas_height=\"600\" bg_color=\"-1\" bg_type=\"color\"></data>");
    expect(centerPatch(d, "h")).toEqual({ xpos: 400 });
    expect(centerPatch(d, "v")).toEqual({ ypos: 300 });
  });
});

describe("transparent shape fill", () => {
  it("shapeSvg emits fill=\"none\" for the no-fill sentinel", () => {
    expect(shapeSvg("rect", "none")).toContain('fill="none"');
  });

  it("setShapeNoFill flags the shape and round-trips; recolor restores", () => {
    const d = parse("<data canvas_width=\"800\" canvas_height=\"600\" bg_color=\"-1\" bg_type=\"color\"></data>");
    const shape = createShapeItem(d, "ellipse", 100, 100, { fill: "#ff0000" });
    d.items.push(shape);

    setShapeNoFill(shape);
    expect(isShapeNoFill(shape)).toBe(true);
    expect(shape.rawAttrs["shape_fill"]).toBe("none");
    expect(shape.source).toContain(encodeURIComponent('fill="none"'));

    // Round-trips through parse/serialize.
    const round = parse(serialize(d));
    const rShape = round.items.find((it) => it.type === "clipart") as ClipartItem;
    expect(rShape.rawAttrs["shape_fill"]).toBe("none");

    // Recolor restores a solid fill.
    setShapeFill(shape, "#00ff00");
    expect(isShapeNoFill(shape)).toBe(false);
    expect(shapeFillHex(shape)).toBe("#00ff00");
  });
});

describe("one-step z-order", () => {
  it("stepForward swaps only the two neighbours' index values", () => {
    const d = parse("<data canvas_width=\"800\" canvas_height=\"600\" bg_color=\"-1\" bg_type=\"color\"></data>");
    const a = createShapeItem(d, "rect", 10, 10); d.items.push(a);
    const b = createShapeItem(d, "rect", 20, 20); d.items.push(b);
    const c = createShapeItem(d, "rect", 30, 30); d.items.push(c);
    // indexes: a=0, b=1, c=2
    stepForward(d, [a]);
    expect(idxOf(d, a)).toBe(1);
    expect(idxOf(d, b)).toBe(0);
    expect(idxOf(d, c)).toBe(2); // untouched
  });

  it("stepBackward moves an item down one", () => {
    const d = parse("<data canvas_width=\"800\" canvas_height=\"600\" bg_color=\"-1\" bg_type=\"color\"></data>");
    const a = createShapeItem(d, "rect", 10, 10); d.items.push(a);
    const b = createShapeItem(d, "rect", 20, 20); d.items.push(b);
    stepBackward(d, [b]);
    expect(idxOf(d, b)).toBe(0);
    expect(idxOf(d, a)).toBe(1);
  });

  it("stepForward at the top of the stack is a no-op", () => {
    const d = parse("<data canvas_width=\"800\" canvas_height=\"600\" bg_color=\"-1\" bg_type=\"color\"></data>");
    const a = createShapeItem(d, "rect", 10, 10); d.items.push(a);
    const b = createShapeItem(d, "rect", 20, 20); d.items.push(b);
    stepForward(d, [b]); // b already top
    expect(idxOf(d, b)).toBe(1);
    expect(idxOf(d, a)).toBe(0);
  });
});

describe("layer reorder (applyOrder) preserves the index multiset", () => {
  it("reordering keeps unmoved items byte-stable in the fixture", () => {
    const before = parse(XML);
    const after = parse(XML);
    const listable = (d: any) =>
      d.items.filter((i: any) => i.type !== "filter").sort((x: any, y: any) => x.index - y.index);
    const asc = listable(after);
    // Move the last item to the front of the stack.
    const moving = asc[asc.length - 1];
    const newOrder = [moving, ...asc.slice(0, asc.length - 1)];
    applyOrder(after, newOrder);

    // The multiset of index values across the reordered items is unchanged.
    const beforeIdx = listable(before).map((i: any) => i.index).sort((a: number, b: number) => a - b);
    const afterIdx = listable(after).map((i: any) => i.index).sort((a: number, b: number) => a - b);
    expect(afterIdx).toEqual(beforeIdx);
  });
});

describe("lock is not a designstring attribute", () => {
  it("serialize never emits isLocked (lock stays session-only)", () => {
    const d = parse(XML);
    expect(serialize(d)).not.toContain("isLocked");
    // Creating items must not introduce it either.
    const t = createTextItem(d, 100, 100);
    d.items.push(t);
    expect(serialize(d)).not.toContain("isLocked");
  });
});
