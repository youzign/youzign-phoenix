import { describe, it, expect } from "vitest";
import { curvedTextArc } from "../src/geometry.js";

describe("curvedTextArc — faithful text-curved arc geometry", () => {
  it("returns curved=false for radius 0 or zero span (fall back to straight)", () => {
    expect(curvedTextArc(0, -60, 60, true).curved).toBe(false);
    expect(curvedTextArc(200, 30, 30, true).curved).toBe(false);
  });

  it("top_direction=true puts the apex at the TOP (min y) of the arc", () => {
    const arc = curvedTextArc(200, -60, 60, true);
    expect(arc.curved).toBe(true);
    // apex is the highest point → its y is the smallest in the box
    expect(arc.apexY).toBeLessThan(arc.height / 2);
    // sweep-flag 1 (clockwise) so text reads left→right over the top
    expect(arc.path).toMatch(/A 200 200 0 0 1 /);
  });

  it("top_direction=false puts the apex at the BOTTOM (max y) and sweeps CCW", () => {
    const arc = curvedTextArc(200, -60, 60, false);
    expect(arc.apexY).toBeGreaterThan(arc.height / 2);
    expect(arc.path).toMatch(/A 200 200 0 0 0 /);
  });

  it("uses the large-arc flag when the span exceeds 180°", () => {
    const arc = curvedTextArc(120, -120, 120, true); // span 240°
    expect(arc.path).toMatch(/A 120 120 0 1 1 /);
    // spanning past ±90° the box width reaches the full diameter (+pad)
    expect(arc.width).toBeGreaterThanOrEqual(240);
  });

  it("apex x sits at the horizontal centre of a symmetric arc", () => {
    const arc = curvedTextArc(200, -60, 60, true);
    expect(arc.apexX).toBeCloseTo(arc.width / 2, 3);
  });
});
