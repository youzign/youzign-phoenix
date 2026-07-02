import { describe, it, expect } from "vitest";
import {
  maskLuminanceAlpha,
  maskThresholdAlpha,
  invertAlpha,
  maskBounds,
  applyAlphaMatte,
} from "../src/index.js";

/** Build a w×h RGBA buffer, painting a value into a rectangle (grayscale). */
function grayMask(
  w: number,
  h: number,
  rect: { x: number; y: number; w: number; h: number },
  value = 255
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside =
        x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      const o = (y * w + x) * 4;
      const v = inside ? value : 0;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

describe("maskLuminanceAlpha — soft matte from a mask image", () => {
  it("maps white→255, black→0 via luminance", () => {
    const rgba = grayMask(4, 4, { x: 1, y: 1, w: 2, h: 2 }, 255);
    const a = maskLuminanceAlpha(rgba, 4, 4);
    expect(a[0]).toBe(0);
    expect(a[1 * 4 + 1]).toBe(255);
    expect(a.length).toBe(16);
  });

  it("preserves mid-gray as partial alpha", () => {
    const rgba = grayMask(2, 1, { x: 0, y: 0, w: 1, h: 1 }, 128);
    const a = maskLuminanceAlpha(rgba, 2, 1);
    expect(a[0]).toBe(128);
    expect(a[1]).toBe(0);
  });
});

describe("maskThresholdAlpha — hard binary cut", () => {
  it("thresholds at 128 by default", () => {
    const rgba = grayMask(3, 1, { x: 1, y: 0, w: 1, h: 1 }, 200);
    const a = maskThresholdAlpha(rgba, 3, 1);
    expect([...a]).toEqual([0, 255, 0]);
  });
});

describe("invertAlpha", () => {
  it("flips 0<->255", () => {
    const inv = invertAlpha(new Uint8ClampedArray([0, 255, 100]));
    expect([...inv]).toEqual([255, 0, 155]);
  });
});

describe("maskBounds — tight subject box", () => {
  it("finds the rectangle of set pixels", () => {
    const rgba = grayMask(8, 6, { x: 2, y: 1, w: 3, h: 2 }, 255);
    const a = maskThresholdAlpha(rgba, 8, 6);
    const b = maskBounds(a, 8, 6);
    expect(b).toEqual({ x: 2, y: 1, width: 3, height: 2 });
  });

  it("returns null for an empty mask", () => {
    const a = new Uint8ClampedArray(16);
    expect(maskBounds(a, 4, 4)).toBeNull();
  });

  it("a single pixel yields a 1x1 box", () => {
    const a = new Uint8ClampedArray(9);
    a[4] = 255; // center of 3x3
    expect(maskBounds(a, 3, 3)).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });
});

describe("applyAlphaMatte — lift subject to transparent buffer", () => {
  it("multiplies existing alpha by the matte", () => {
    // 2x1 opaque red image
    const img = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]);
    const matte = new Uint8ClampedArray([255, 0]); // keep px0, drop px1
    const out = applyAlphaMatte(img, matte, 2, 1);
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(0);
    // RGB preserved, source untouched
    expect(out[0]).toBe(255);
    expect(img[7]).toBe(255);
  });

  it("half matte halves an opaque pixel", () => {
    const img = new Uint8ClampedArray([10, 20, 30, 255]);
    const out = applyAlphaMatte(img, new Uint8ClampedArray([128]), 1, 1);
    expect(out[3]).toBe(128);
  });
});
