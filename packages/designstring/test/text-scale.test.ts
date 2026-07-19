import { describe, expect, it } from "vitest";
import { textScale, textOrigin } from "../src/text-scale.js";

const base = { rotation: 0, textAreaWidth: 0, textAreaHeight: 0, mcWidth: 0, mcHeight: 0 };

describe("textScale", () => {
  it("returns mc/textArea unchanged for unrotated text (byte-stable path)", () => {
    const { sx, sy } = textScale({
      ...base,
      rotation: 0,
      textAreaWidth: 200,
      textAreaHeight: 40,
      mcWidth: 300, // scale 1.5
      mcHeight: 60, // scale 1.5
    });
    expect(sx).toBeCloseTo(1.5, 6);
    expect(sy).toBeCloseTo(1.5, 6);
  });

  it("reconstructs true scale ~1.0 for the legacy 'vork' AABB-stored rotated text", () => {
    // mcWidth/mcHeight are the rotated AABB, not scale×area. Raw ratio would be
    // 0.4586 / 2.2387 (the bug); true scale is 1.0.
    const { sx, sy } = textScale({
      rotation: -90.5659415730855,
      textAreaWidth: 727.3,
      textAreaHeight: 326.3,
      mcWidth: 333.5,
      mcHeight: 730.45,
    });
    expect(sx).toBeCloseTo(1.0, 2);
    expect(sy).toBeCloseTo(1.0, 2);
  });

  it("keeps in-app scale-semantics (uniform) rotated text as-is", () => {
    // Text rotated 90° inside this app: mc = scale×area (sx=sy=1), unchanged.
    const { sx, sy } = textScale({
      rotation: 90,
      textAreaWidth: 200,
      textAreaHeight: 40,
      mcWidth: 200,
      mcHeight: 40,
    });
    expect(sx).toBeCloseTo(1.0, 6);
    expect(sy).toBeCloseTo(1.0, 6);
  });

  it("recovers a uniform scale for a near-vertical legacy label", () => {
    // TASA label: taW 242.8 × taH 29.35 rotated 87.5°, mc (86.45, 343.15).
    // Scale-read gives absurd (0.36, 11.7); AABB solve is the sane reading.
    const { sx, sy } = textScale({
      rotation: 87.5,
      textAreaWidth: 242.8,
      textAreaHeight: 29.35,
      mcWidth: 86.45,
      mcHeight: 343.15,
    });
    // Not the scale-read blow-up.
    expect(sy).toBeLessThan(5);
    expect(sx).toBeGreaterThan(0.9);
  });

  it("rotates the anchor offset about (xpos,ypos) for legacy AABB text", () => {
    // The 'vork' label: with the Flash pivot the text-area div origin lands on
    // canvas (the 1445×2560 fork), not ~450px above it. AABB detected ⇒ rotated
    // offset. Box centre must sit near the reference thumbnail (~1238,420).
    const item = {
      rotation: -90.5659415730855,
      textAreaWidth: 727.3,
      textAreaHeight: 326.3,
      mcWidth: 333.5,
      mcHeight: 730.45,
      xpos: 1166,
      ypos: 421,
      textAreaxpos: -363.65,
      textAreaypos: -90.9,
    };
    const o = textOrigin(item);
    expect(o.aabb).toBe(true);
    // div local (0,0) → on-canvas, well below the old (~330 / -400) placement.
    expect(o.left).toBeGreaterThan(1000);
    expect(o.top).toBeGreaterThan(700);
    // box centre = origin + rotated( (taW/2, taH/2) · scale )
    const rad = (item.rotation * Math.PI) / 180;
    const hx = (item.textAreaWidth / 2) * o.sx;
    const hy = (item.textAreaHeight / 2) * o.sy;
    const cx = o.left + Math.cos(rad) * hx - Math.sin(rad) * hy;
    const cy = o.top + Math.sin(rad) * hx + Math.cos(rad) * hy;
    expect(cx).toBeGreaterThan(1150);
    expect(cx).toBeLessThan(1320);
    expect(cy).toBeGreaterThan(360);
    expect(cy).toBeLessThan(480);
  });

  it("keeps the axis-aligned anchor for in-app scale-semantics text", () => {
    // rotation 90, uniform mc ⇒ scale-semantics ⇒ current (un-rotated) offset.
    const o = textOrigin({
      rotation: 90,
      textAreaWidth: 200,
      textAreaHeight: 40,
      mcWidth: 200,
      mcHeight: 40,
      xpos: 400,
      ypos: 300,
      textAreaxpos: -100,
      textAreaypos: -20,
    });
    expect(o.aabb).toBe(false);
    expect(o.left).toBeCloseTo(300, 6); // xpos + textAreaxpos·sx
    expect(o.top).toBeCloseTo(280, 6); // ypos + textAreaypos·sy
  });

  it("falls back to a finite uniform scale near 45° (ill-conditioned solve)", () => {
    // Non-square box at 44.9° (inside the ill-conditioned band): AABB of a
    // uniformly-scaled(1.0) 200×100 box → mc (212.28, 211.98). The 2×2 solve is
    // near-singular here, so the uniform fallback must still recover ~1.0.
    const { sx, sy } = textScale({
      rotation: 44.9,
      textAreaWidth: 200,
      textAreaHeight: 100,
      mcWidth: 212.28,
      mcHeight: 211.98,
    });
    expect(sx).toBeCloseTo(1.0, 1);
    expect(sy).toBeCloseTo(1.0, 1);
    expect(isFinite(sx)).toBe(true);
  });
});
