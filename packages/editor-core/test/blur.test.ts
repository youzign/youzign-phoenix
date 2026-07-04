import { describe, it, expect } from "vitest";
import { gaussianBlurRGBA } from "../src/index.js";

/** Build a w×h RGBA buffer filled with a single gray value, alpha 255. */
function flat(w: number, h: number, value: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = value;
    rgba[i * 4 + 1] = value;
    rgba[i * 4 + 2] = value;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

describe("gaussianBlurRGBA — WebKit fallback for ctx.filter blur", () => {
  it("leaves a uniform image unchanged", () => {
    const rgba = flat(16, 16, 128);
    gaussianBlurRGBA(rgba, 16, 16, 8);
    for (let i = 0; i < 16 * 16; i++) {
      expect(rgba[i * 4]).toBe(128);
      expect(rgba[i * 4 + 1]).toBe(128);
      expect(rgba[i * 4 + 2]).toBe(128);
      expect(rgba[i * 4 + 3]).toBe(255);
    }
  });

  it("is a no-op at sigma 0", () => {
    const rgba = flat(8, 8, 40);
    rgba[(4 * 8 + 4) * 4] = 255;
    const before = Array.from(rgba);
    gaussianBlurRGBA(rgba, 8, 8, 0);
    expect(Array.from(rgba)).toEqual(before);
  });

  it("spreads an impulse symmetrically and conserves brightness", () => {
    const w = 31;
    const h = 31;
    const rgba = flat(w, h, 0);
    const cx = 15;
    const cy = 15;
    rgba[(cy * w + cx) * 4] = 255;
    const sumBefore = 255;
    gaussianBlurRGBA(rgba, w, h, 3);
    const at = (x: number, y: number) => rgba[(y * w + x) * 4];
    // Center flattens, neighbours pick up mass.
    expect(at(cx, cy)).toBeLessThan(255);
    expect(at(cx + 2, cy)).toBeGreaterThan(0);
    // Horizontal/vertical symmetry around the impulse.
    expect(at(cx + 3, cy)).toBe(at(cx - 3, cy));
    expect(at(cx, cy + 3)).toBe(at(cx, cy - 3));
    // Total brightness roughly conserved (integer rounding eats the tails).
    let sumAfter = 0;
    for (let i = 0; i < w * h; i++) sumAfter += rgba[i * 4];
    expect(Math.abs(sumAfter - sumBefore)).toBeLessThan(sumBefore * 0.15);
  });

  it("blurs a hard vertical edge into a monotonic ramp", () => {
    const w = 32;
    const h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = x < 16 ? 0 : 200;
        const o = (y * w + x) * 4;
        rgba[o] = v;
        rgba[o + 3] = 255;
      }
    gaussianBlurRGBA(rgba, w, h, 4);
    const row = (x: number) => rgba[(3 * w + x) * 4];
    expect(row(8)).toBeLessThan(row(14));
    expect(row(14)).toBeLessThan(row(18));
    expect(row(18)).toBeLessThan(row(26));
  });
});
