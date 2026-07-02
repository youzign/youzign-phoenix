import { describe, it, expect } from "vitest";
import {
  computeLetterbox,
  normalizeToTensor,
  maskToAlphaImage,
  compositeAlpha,
  applySource,
  BG_MODEL_INPUT,
  BG_MEAN,
  BG_STD,
} from "../src/index.js";
import type { ImageItem } from "@youzign/designstring";

describe("computeLetterbox — aspect-preserving fit into a square", () => {
  it("landscape: scaled by width, padded top/bottom", () => {
    const lb = computeLetterbox(640, 320, 320);
    expect(lb.scale).toBeCloseTo(0.5, 6);
    expect(lb.drawW).toBeCloseTo(320, 6);
    expect(lb.drawH).toBeCloseTo(160, 6);
    expect(lb.dx).toBeCloseTo(0, 6);
    expect(lb.dy).toBeCloseTo(80, 6); // (320-160)/2
  });

  it("portrait: scaled by height, padded left/right", () => {
    const lb = computeLetterbox(160, 320, 320);
    expect(lb.scale).toBeCloseTo(1, 6);
    expect(lb.drawW).toBeCloseTo(160, 6);
    expect(lb.drawH).toBeCloseTo(320, 6);
    expect(lb.dx).toBeCloseTo(80, 6);
    expect(lb.dy).toBeCloseTo(0, 6);
  });

  it("square: exact fit, no padding", () => {
    const lb = computeLetterbox(500, 500, 320);
    expect(lb.drawW).toBeCloseTo(320, 6);
    expect(lb.drawH).toBeCloseTo(320, 6);
    expect(lb.dx).toBeCloseTo(0, 6);
    expect(lb.dy).toBeCloseTo(0, 6);
  });

  it("guards zero dimensions", () => {
    const lb = computeLetterbox(0, 0, 320);
    expect(Number.isFinite(lb.scale)).toBe(true);
    expect(lb.size).toBe(320);
  });

  it("default size is the model input", () => {
    expect(computeLetterbox(100, 100).size).toBe(BG_MODEL_INPUT);
  });
});

describe("normalizeToTensor — CHW float tensor", () => {
  it("packs channel-planar and applies (x/max - mean)/std", () => {
    // 2x2 image. Max sample is 255 (from the white pixel), so divide by 255.
    const size = 2;
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, // px0 red
      0, 255, 0, 255, // px1 green
      0, 0, 255, 255, // px2 blue
      255, 255, 255, 255, // px3 white
    ]);
    const t = normalizeToTensor(rgba, size);
    expect(t.length).toBe(3 * size * size);
    // R plane [0..4), G plane [4..8), B plane [8..12)
    // px0 red channel R = (1 - mean)/std
    expect(t[0]).toBeCloseTo((1 - BG_MEAN[0]) / BG_STD[0], 5);
    // px0 green channel = (0 - mean)/std
    expect(t[4]).toBeCloseTo((0 - BG_MEAN[1]) / BG_STD[1], 5);
    // px3 white in all planes = (1 - mean)/std
    expect(t[3]).toBeCloseTo((1 - BG_MEAN[0]) / BG_STD[0], 5);
    expect(t[7]).toBeCloseTo((1 - BG_MEAN[1]) / BG_STD[1], 5);
    expect(t[11]).toBeCloseTo((1 - BG_MEAN[2]) / BG_STD[2], 5);
  });

  it("handles an all-black image without NaN (max clamped to 1)", () => {
    const rgba = new Uint8ClampedArray(4 * 4).fill(0);
    // set alpha only
    for (let i = 0; i < 4; i++) rgba[i * 4 + 3] = 255;
    const t = normalizeToTensor(rgba, 2);
    expect(t.every((v) => Number.isFinite(v))).toBe(true);
    expect(t[0]).toBeCloseTo((0 - BG_MEAN[0]) / BG_STD[0], 5);
  });
});

describe("maskToAlphaImage — min-max normalise into alpha", () => {
  it("maps min→0 and max→255 alpha, RGB stays white", () => {
    const mask = new Float32Array([0.2, 0.7, 0.2, 1.2]); // min 0.2 max 1.2
    const img = maskToAlphaImage(mask, 2);
    expect(img.length).toBe(2 * 2 * 4);
    expect(img[0 * 4 + 3]).toBe(0); // 0.2 -> min
    expect(img[3 * 4 + 3]).toBe(255); // 1.2 -> max
    // 0.7 is halfway → ~128
    expect(img[1 * 4 + 3]).toBeGreaterThan(120);
    expect(img[1 * 4 + 3]).toBeLessThan(135);
    expect(img[0]).toBe(255); // R
    expect(img[1]).toBe(255); // G
    expect(img[2]).toBe(255); // B
  });

  it("flat mask does not divide by zero", () => {
    const img = maskToAlphaImage(new Float32Array([0.5, 0.5, 0.5, 0.5]), 2);
    expect(img.every((_, i) => Number.isFinite(img[i]))).toBe(true);
  });
});

describe("compositeAlpha — apply matte onto original RGBA", () => {
  it("replaces alpha, preserves RGB, cuts out background corners", () => {
    // 2x2 opaque colour block
    const rgba = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
      70, 80, 90, 255,
      100, 110, 120, 255,
    ]);
    // subject at px1 only; corners transparent
    const alpha = new Uint8ClampedArray([0, 255, 0, 0]);
    const out = compositeAlpha(rgba, alpha, 2, 2);
    expect(out).toBe(rgba); // in place
    expect(out[0 * 4 + 3]).toBe(0); // corner cut
    expect(out[1 * 4 + 3]).toBe(255); // subject kept
    expect(out[3 * 4 + 3]).toBe(0); // corner cut
    // RGB untouched
    expect([out[4], out[5], out[6]]).toEqual([40, 50, 60]);
  });
});

describe("applySource — destructive source swap (bg removal)", () => {
  function imageItem(): ImageItem {
    return {
      type: "image",
      rawAttrs: { source: "orig.png", width: "200", cropped: "false" },
      attrOrder: ["source", "width", "cropped"],
      extraAttrs: {},
      index: 0,
      xpos: 100,
      ypos: 100,
      width: 200,
      height: 150,
      rotation: 0,
      opacity: 1,
      hFlip: false,
      vFlip: false,
      source: "orig.png",
      cropped: false,
    } as unknown as ImageItem;
  }

  it("swaps source in both typed field and rawAttrs, geometry unchanged", () => {
    const it = imageItem();
    applySource(it, "data:image/png;base64,CUTOUT");
    expect(it.source).toBe("data:image/png;base64,CUTOUT");
    expect(it.rawAttrs.source).toBe("data:image/png;base64,CUTOUT");
    expect(it.width).toBe(200);
    expect(it.height).toBe(150);
    expect(it.xpos).toBe(100);
    // did not invent a "cropped" flip
    expect(it.rawAttrs.cropped).toBe("false");
  });
});
