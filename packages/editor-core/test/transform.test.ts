import { describe, it, expect } from "vitest";
import { resizeCorner, resizeEdge, edgeCropRect, snapRotation, normalizeAngle } from "../src/transform.js";
import type { SelBox } from "../src/geometry.js";

const box: SelBox = { cx: 100, cy: 100, w: 100, h: 50, rotation: 0 };

describe("resizeCorner", () => {
  it("pins the opposite corner (se drag grows toward pointer)", () => {
    // Drag SE corner to (200, 200); NW corner (50,75) must stay fixed.
    const r = resizeCorner(box, "se", { x: 200, y: 200 }, false);
    expect(r.width).toBeCloseTo(150); // 200 - 50
    expect(r.height).toBeCloseTo(125); // 200 - 75
    // new NW corner = center - half:
    expect(r.xpos - r.width / 2).toBeCloseTo(50);
    expect(r.ypos - r.height / 2).toBeCloseTo(75);
  });

  it("free resize (lockAspect false) changes ratio", () => {
    const r = resizeCorner(box, "se", { x: 300, y: 120 }, false);
    expect(r.width).toBeCloseTo(250);
    expect(r.height).toBeCloseTo(45);
    expect(r.width / r.height).not.toBeCloseTo(box.w / box.h);
  });

  it("lockAspect preserves the start ratio", () => {
    const ratio = box.w / box.h; // 2
    const r = resizeCorner(box, "se", { x: 300, y: 120 }, true);
    expect(r.width / r.height).toBeCloseTo(ratio);
  });

  it("enforces a minimum size", () => {
    const r = resizeCorner(box, "se", { x: 50, y: 75 }, false);
    expect(r.width).toBeGreaterThanOrEqual(8);
    expect(r.height).toBeGreaterThanOrEqual(8);
  });
});

describe("resizeEdge", () => {
  it("east edge stretches width only, pins west edge", () => {
    const r = resizeEdge(box, "e", { x: 220, y: 999 });
    expect(r.height).toBeCloseTo(50); // unchanged
    expect(r.width).toBeCloseTo(170); // 220 - west(50)
    expect(r.xpos - r.width / 2).toBeCloseTo(50); // west pinned
    expect(r.ypos).toBeCloseTo(100); // vertical center unchanged
  });

  it("north edge stretches height only, pins south edge", () => {
    const r = resizeEdge(box, "n", { x: 999, y: 50 });
    expect(r.width).toBeCloseTo(100);
    expect(r.height).toBeCloseTo(75); // south(125) - 50
    expect(r.ypos + r.height / 2).toBeCloseTo(125); // south pinned
  });
});

describe("edgeCropRect", () => {
  const ibox = { xpos: 100, ypos: 100, width: 200, height: 100 };
  it("cropping west inward shrinks from the left", () => {
    const r = edgeCropRect(ibox, "w", { x: 40, y: 0 });
    expect(r.x).toBeCloseTo(40);
    expect(r.w).toBeCloseTo(160); // right(200) - 40
    expect(r.y).toBeCloseTo(50);
    expect(r.h).toBeCloseTo(100);
  });
  it("cannot expand past the original edge", () => {
    const r = edgeCropRect(ibox, "w", { x: -50, y: 0 });
    expect(r.x).toBeCloseTo(0); // clamped to original left
  });
  it("south crop shrinks height", () => {
    const r = edgeCropRect(ibox, "s", { x: 0, y: 120 });
    expect(r.h).toBeCloseTo(70); // 120 - top(50)
  });
  it("is bidirectional within a gesture: dragging back out restores full width", () => {
    // West edge dragged inward to x=40 then back out toward/past the original edge.
    const inward = edgeCropRect(ibox, "w", { x: 40, y: 0 });
    expect(inward.w).toBeCloseTo(160);
    const back = edgeCropRect(ibox, "w", { x: 0, y: 0 }); // back to original left
    expect(back.x).toBeCloseTo(0);
    expect(back.w).toBeCloseTo(200); // fully un-cropped
  });
});

describe("normalizeAngle", () => {
  it("wraps into [0,360)", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-45)).toBe(315);
    expect(normalizeAngle(450)).toBe(90);
  });
});

describe("snapRotation", () => {
  it("snaps to nearest 45° within threshold", () => {
    const r = snapRotation(47);
    expect(r.angle).toBe(45);
    expect(r.snapped).toBe(true);
    expect(r.strong).toBe(false);
  });
  it("flags cardinals as strong", () => {
    expect(snapRotation(2).strong).toBe(true); // -> 0
    expect(snapRotation(88).strong).toBe(true); // -> 90
    expect(snapRotation(182).strong).toBe(true); // -> 180
  });
  it("does not snap outside threshold", () => {
    const r = snapRotation(30);
    expect(r.snapped).toBe(false);
    expect(r.angle).toBe(30);
  });
  it("snaps -45-equivalent to 315", () => {
    expect(snapRotation(-44).angle).toBe(315);
    expect(snapRotation(357).angle).toBe(0);
  });
  it("fine mode disables snapping and normalises", () => {
    const r = snapRotation(46, { fine: true });
    expect(r.snapped).toBe(false);
    expect(r.angle).toBe(46);
    expect(snapRotation(-10, { fine: true }).angle).toBe(350);
  });
  it("step mode quantises to 15°", () => {
    expect(snapRotation(52, { step: true }).angle).toBe(45);
    expect(snapRotation(58, { step: true }).angle).toBe(60);
    expect(snapRotation(58, { step: true }).strong).toBe(false);
    expect(snapRotation(88, { step: true }).strong).toBe(true); // 90
  });
  it("honours a custom threshold", () => {
    expect(snapRotation(50, { threshold: 8 }).angle).toBe(45);
    expect(snapRotation(50, { threshold: 2 }).snapped).toBe(false);
  });
});
