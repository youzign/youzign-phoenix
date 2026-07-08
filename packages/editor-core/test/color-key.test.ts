import { describe, expect, it } from "vitest";
import { keyColorAlpha, sampleBorderColor } from "../src/index.js";

describe("keyColorAlpha", () => {
  it("keys out the target color without mutating the source", () => {
    const rgba = new Uint8ClampedArray([
      30, 90, 210, 255,
      255, 255, 255, 255,
      30, 90, 210, 180,
      250, 250, 250, 128,
    ]);

    const out = keyColorAlpha(rgba, 2, 2, { r: 30, g: 90, b: 210 }, 40);

    expect(out).not.toBe(rgba);
    expect(out[3]).toBe(0);
    expect(out[11]).toBe(0);
    expect(out[7]).toBe(255);
    expect(out[15]).toBe(128);
    expect(rgba[3]).toBe(255);
    expect(rgba[11]).toBe(180);
  });

  it("softens alpha in the outer tolerance band", () => {
    const rgba = new Uint8ClampedArray([55, 0, 0, 200]);
    const out = keyColorAlpha(rgba, 1, 1, { r: 0, g: 0, b: 0 }, 100);

    expect(out[3]).toBe(20);
  });
});

describe("sampleBorderColor", () => {
  it("averages the outermost border ring", () => {
    const rgba = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < 9; i++) {
      const o = i * 4;
      rgba[o] = 20;
      rgba[o + 1] = 80;
      rgba[o + 2] = 200;
      rgba[o + 3] = 255;
    }
    const center = (1 * 3 + 1) * 4;
    rgba[center] = 255;
    rgba[center + 1] = 255;
    rgba[center + 2] = 255;

    expect(sampleBorderColor(rgba, 3, 3)).toEqual({ r: 20, g: 80, b: 200 });
  });
});
