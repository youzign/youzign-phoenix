// Pure pre/post-processing math for local background removal.
//
// Engine + model (documented here for provenance):
//   • Model:   U²-Netp ("u2netp") — the small variant of U²-Net.
//   • License: Apache-2.0 (github.com/xuebinqin/U-2-Net) — commercially usable.
//   • Size:    ~4.5 MB ONNX (bundled in apps/editor/public/models/u2netp.onnx).
//   • I/O:     input "input.1" [1,3,320,320] float CHW; output [1,1,320,320]
//              single-channel saliency map in [0,1]-ish (min-max normalised).
//   • Runtime: onnxruntime-web (WASM baseline, WebGPU when available) in a
//              Web Worker — see apps/editor/src/bg/worker.ts.
//
// This module is intentionally free of DOM/ORT imports so the math is unit
// testable on tiny fixtures. The worker owns the canvas rasterisation (drawing
// the source into the letterboxed square, and scaling the mask back up); the
// per-pixel arithmetic lives here.

/** The model's fixed square input side (px). */
export const BG_MODEL_INPUT = 320;

/** ImageNet normalisation constants used by U²-Net's preprocessing. */
export const BG_MEAN: readonly [number, number, number] = [0.485, 0.456, 0.406];
export const BG_STD: readonly [number, number, number] = [0.229, 0.224, 0.225];

export interface Letterbox {
  /** uniform scale applied to the source so it fits inside the square */
  scale: number;
  /** size of the drawn (non-padded) image inside the square */
  drawW: number;
  drawH: number;
  /** top-left offset of the drawn image inside the square (padding) */
  dx: number;
  dy: number;
  /** the square side these are relative to */
  size: number;
}

/**
 * Fit a (w×h) source into a `size`×`size` square preserving aspect ratio,
 * centring it (letterbox). Returns the geometry the caller uses to draw the
 * source into the square and later to crop the mask back out.
 */
export function computeLetterbox(w: number, h: number, size = BG_MODEL_INPUT): Letterbox {
  const safeW = Math.max(1, w);
  const safeH = Math.max(1, h);
  const scale = Math.min(size / safeW, size / safeH);
  const drawW = safeW * scale;
  const drawH = safeH * scale;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;
  return { scale, drawW, drawH, dx, dy, size };
}

/**
 * Convert a square RGBA buffer (size×size, from the letterboxed draw) into the
 * model's CHW float tensor. Mirrors U²-Net/rembg preprocessing: divide by the
 * max pixel value across the image, then per-channel (x-mean)/std.
 */
export function normalizeToTensor(rgba: Uint8ClampedArray | Uint8Array, size: number): Float32Array {
  const px = size * size;
  // max over all RGB samples (rembg divides by np.max(image), not 255).
  let max = 0;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    if (rgba[o] > max) max = rgba[o];
    if (rgba[o + 1] > max) max = rgba[o + 1];
    if (rgba[o + 2] > max) max = rgba[o + 2];
  }
  if (max === 0) max = 1;
  const out = new Float32Array(3 * px);
  const rBase = 0;
  const gBase = px;
  const bBase = 2 * px;
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    out[rBase + i] = (rgba[o] / max - BG_MEAN[0]) / BG_STD[0];
    out[gBase + i] = (rgba[o + 1] / max - BG_MEAN[1]) / BG_STD[1];
    out[bBase + i] = (rgba[o + 2] / max - BG_MEAN[2]) / BG_STD[2];
  }
  return out;
}

/**
 * Min-max normalise the raw saliency map into 0..255 and pack it as an RGBA
 * grayscale-in-alpha buffer (R=G=B=255, A=mask) suitable for drawing to a
 * canvas so it can be scaled back to the source resolution. Returns the packed
 * buffer for a `size`×`size` mask.
 */
export function maskToAlphaImage(mask: Float32Array, size: number): Uint8ClampedArray {
  let mi = Infinity;
  let ma = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    if (v < mi) mi = v;
    if (v > ma) ma = v;
  }
  const span = ma - mi || 1;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = Math.round(((mask[i] - mi) / span) * 255);
    const o = i * 4;
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = a;
  }
  return out;
}

/**
 * Composite an alpha channel onto an original RGBA buffer, in place. `alpha` is
 * a per-pixel 0..255 array (length = width*height), already resized to the
 * source resolution. Returns the same buffer (RGB preserved, A replaced).
 */
export function compositeAlpha(
  rgba: Uint8ClampedArray,
  alpha: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const n = width * height;
  for (let i = 0; i < n; i++) {
    rgba[i * 4 + 3] = alpha[i];
  }
  return rgba;
}
