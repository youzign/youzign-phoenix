import { describe, it, expect } from "vitest";
import {
  boxCandidates,
  canvasTargets,
  itemTargets,
  gridTargets,
  mergeTargets,
  snapAxis,
  resolveSnap,
} from "../src/snapping.js";
import type { SelBox } from "../src/geometry.js";

const box = (cx: number, cy: number, w = 100, h = 100, rotation = 0): SelBox => ({
  cx,
  cy,
  w,
  h,
  rotation,
});

describe("boxCandidates", () => {
  it("returns left/center/right and top/center/bottom", () => {
    const c = boxCandidates(box(100, 100, 100, 60));
    expect(c.v).toEqual([50, 100, 150]);
    expect(c.h).toEqual([70, 100, 130]);
  });
  it("uses the rotation-aware AABB for rotated boxes", () => {
    const c = boxCandidates(box(0, 0, 100, 100, 45));
    const half = (100 * Math.SQRT2) / 2;
    expect(c.v[0]).toBeCloseTo(-half);
    expect(c.v[2]).toBeCloseTo(half);
  });
});

describe("target generation", () => {
  it("canvasTargets = edges + center", () => {
    expect(canvasTargets(800, 600)).toEqual({ v: [0, 400, 800], h: [0, 300, 600] });
  });
  it("gridTargets steps across the canvas", () => {
    const g = gridTargets(16, 8, 8);
    expect(g.v).toEqual([0, 8, 16]);
    expect(g.h).toEqual([0, 8]);
  });
  it("itemTargets + mergeTargets combine sets", () => {
    const t = mergeTargets(canvasTargets(800, 600), itemTargets([box(200, 200, 100, 100)]));
    expect(t.v).toContain(400); // canvas center
    expect(t.v).toContain(150); // item left
    expect(t.v).toContain(200); // item center
  });
});

describe("snapAxis", () => {
  it("engages within threshold and returns the corrective delta", () => {
    // candidate at 404, target 400, threshold 6 → delta -4
    const r = snapAxis([404], [400], { threshold: 6, engaged: null });
    expect(r.line).toBe(400);
    expect(r.delta).toBeCloseTo(-4);
  });
  it("does not engage outside threshold", () => {
    const r = snapAxis([420], [400], { threshold: 6, engaged: null });
    expect(r.line).toBeNull();
    expect(r.delta).toBe(0);
  });
  it("hysteresis: stays engaged until past release", () => {
    // engaged at 400, candidate drifted to 408, threshold 6, release 12 → still stuck
    const r = snapAxis([408], [400], { threshold: 6, release: 12, engaged: 400 });
    expect(r.line).toBe(400);
    expect(r.delta).toBeCloseTo(-8);
  });
  it("hysteresis: releases past the release distance", () => {
    const r = snapAxis([415], [400], { threshold: 6, release: 12, engaged: 400 });
    expect(r.line).toBeNull();
  });
  it("picks the nearest of several candidates/targets", () => {
    const r = snapAxis([50, 100, 150], [98, 300], { threshold: 6, engaged: null });
    expect(r.line).toBe(98);
    expect(r.delta).toBeCloseTo(-2); // 98 - 100
  });
});

describe("resolveSnap", () => {
  it("snaps a box center to canvas center on both axes", () => {
    const targets = canvasTargets(800, 600);
    // box center at (404, 302) → should snap to (400, 300)
    const r = resolveSnap(box(404, 302, 100, 100), targets, { threshold: 6 });
    expect(r.dx).toBeCloseTo(-4);
    expect(r.dy).toBeCloseTo(-2);
    expect(r.guides.v).toEqual([400]);
    expect(r.guides.h).toEqual([300]);
    expect(r.engaged).toEqual({ v: 400, h: 300 });
  });
  it("no snap when far away", () => {
    const r = resolveSnap(box(100, 100, 40, 40), canvasTargets(800, 600), { threshold: 6 });
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.guides.v).toEqual([]);
  });
  it("threads engaged state for sticky behavior", () => {
    const targets = canvasTargets(800, 600);
    const first = resolveSnap(box(402, 300, 100, 100), targets, { threshold: 6 });
    expect(first.engaged.v).toBe(400);
    // drift to 407 — within release (default 10.8) so still engaged
    const second = resolveSnap(box(407, 300, 100, 100), targets, {
      threshold: 6,
      engaged: first.engaged,
    });
    expect(second.engaged.v).toBe(400);
  });
});
