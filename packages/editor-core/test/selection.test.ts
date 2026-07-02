import { describe, it, expect } from "vitest";
import {
  toggleUid,
  addUid,
  removeUid,
  normalizeSelection,
  sameSelection,
  moveItems,
  combinedBox,
  boxCorners,
  boxAABB,
  boxIntersectsRect,
  rectsIntersect,
  childBoxInCanvas,
  type SelBox,
} from "../src/index.js";

describe("selection set ops", () => {
  it("toggleUid adds when absent and removes when present", () => {
    expect(toggleUid([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleUid([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("addUid is idempotent; removeUid drops the uid", () => {
    expect(addUid([1], 1)).toEqual([1]);
    expect(addUid([1], 2)).toEqual([1, 2]);
    expect(removeUid([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("normalizeSelection dedupes and drops nullish preserving order", () => {
    expect(normalizeSelection([2, null, 2, undefined, 1, 2])).toEqual([2, 1]);
  });

  it("sameSelection is order-insensitive", () => {
    expect(sameSelection([1, 2, 3], [3, 2, 1])).toBe(true);
    expect(sameSelection([1, 2], [1, 2, 3])).toBe(false);
  });
});

describe("moveItems", () => {
  it("applies a shared delta to every item without mutating input", () => {
    const starts = [
      { uid: 1, xpos: 10, ypos: 20 },
      { uid: 2, xpos: 0, ypos: 0 },
    ];
    const moved = moveItems(starts, 5, -3);
    expect(moved).toEqual([
      { uid: 1, xpos: 15, ypos: 17 },
      { uid: 2, xpos: 5, ypos: -3 },
    ]);
    expect(starts[0].xpos).toBe(10); // unchanged
  });
});

describe("combinedBox", () => {
  it("returns null for empty input", () => {
    expect(combinedBox([])).toBeNull();
  });

  it("encloses two axis-aligned boxes", () => {
    const a: SelBox = { cx: 0, cy: 0, w: 10, h: 10, rotation: 0 };
    const b: SelBox = { cx: 20, cy: 20, w: 10, h: 10, rotation: 0 };
    const c = combinedBox([a, b])!;
    // a spans [-5,-5..5,5], b spans [15,15..25,25] => [-5,-5..25,25]
    expect(c.cx).toBe(10);
    expect(c.cy).toBe(10);
    expect(c.w).toBe(30);
    expect(c.h).toBe(30);
    expect(c.rotation).toBe(0);
  });

  it("accounts for rotation of a member box", () => {
    // a 10x10 box rotated 45deg has a diagonal extent of ~14.14
    const box: SelBox = { cx: 0, cy: 0, w: 10, h: 10, rotation: 45 };
    const c = combinedBox([box])!;
    expect(c.w).toBeCloseTo(Math.sqrt(200), 3);
    expect(c.h).toBeCloseTo(Math.sqrt(200), 3);
  });
});

describe("box geometry", () => {
  it("boxCorners returns four corners in canvas space", () => {
    const box: SelBox = { cx: 5, cy: 5, w: 10, h: 10, rotation: 0 };
    const pts = boxCorners(box);
    expect(pts).toHaveLength(4);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[2]).toEqual({ x: 10, y: 10 });
  });

  it("boxAABB of an unrotated box equals the box rect", () => {
    const box: SelBox = { cx: 5, cy: 5, w: 10, h: 4, rotation: 0 };
    expect(boxAABB(box)).toEqual({ x: 0, y: 3, w: 10, h: 4 });
  });
});

describe("marquee intersection", () => {
  it("rectsIntersect detects overlap and separation", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 5, h: 5 })).toBe(false);
  });

  it("boxIntersectsRect hits a box overlapping the marquee", () => {
    const box: SelBox = { cx: 8, cy: 8, w: 10, h: 10, rotation: 0 };
    expect(boxIntersectsRect(box, { x: 0, y: 0, w: 5, h: 5 })).toBe(true); // box spans 3..13
    expect(boxIntersectsRect(box, { x: 50, y: 50, w: 5, h: 5 })).toBe(false);
  });
});

describe("childBoxInCanvas", () => {
  it("translates a group child's local box to canvas space (identity transform)", () => {
    const group = { xpos: 100, ypos: 200, scaleX: 1, scaleY: 1, rotation: 0 };
    const childLocal: SelBox = { cx: 10, cy: -5, w: 20, h: 30, rotation: 0 };
    const cb = childBoxInCanvas(group as any, childLocal);
    expect(cb.cx).toBe(110);
    expect(cb.cy).toBe(195);
    expect(cb.w).toBe(20);
    expect(cb.h).toBe(30);
  });

  it("applies group scale and rotation", () => {
    const group = { xpos: 0, ypos: 0, scaleX: 2, scaleY: 2, rotation: 90 };
    const childLocal: SelBox = { cx: 10, cy: 0, w: 4, h: 4, rotation: 0 };
    const cb = childBoxInCanvas(group as any, childLocal);
    // scaled center (20,0) rotated 90deg -> (0,20)
    expect(cb.cx).toBeCloseTo(0, 6);
    expect(cb.cy).toBeCloseTo(20, 6);
    expect(cb.w).toBe(8);
    expect(cb.rotation).toBe(90);
  });
});
