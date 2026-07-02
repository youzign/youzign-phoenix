// Pure mask/composite math for the fal-powered "Magic" suite (eraser, grab,
// background blur). Kept free of DOM/network so it is unit-testable; the app
// layer (apps/editor/src/magic/*) owns canvas rasterisation and the fal calls.
//
// Conventions:
//   • A "mask image" is an RGBA buffer where a bright pixel marks the region of
//     interest (white subject on black, as returned by SAM2 and painted by the
//     eraser brush). Luminance is used so anti-aliased edges survive.
//   • An "alpha buffer" is a per-pixel 0..255 array (length = w*h).

/** Rec.601 luminance of a pixel, 0..255. */
function luma(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/**
 * Turn a mask image (RGBA) into a soft alpha buffer using per-pixel luminance,
 * so a white-on-black mask becomes an opacity matte with smooth edges.
 */
export function maskLuminanceAlpha(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const n = width * height;
  const a = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    a[i] = Math.round(luma(rgba[o], rgba[o + 1], rgba[o + 2]));
  }
  return a;
}

/**
 * Hard threshold a mask image (RGBA) into a binary alpha buffer (0 or 255).
 * Used when a crisp cut is wanted (e.g. computing a subject's bounding box).
 */
export function maskThresholdAlpha(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 128
): Uint8ClampedArray {
  const n = width * height;
  const a = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    a[i] = luma(rgba[o], rgba[o + 1], rgba[o + 2]) >= threshold ? 255 : 0;
  }
  return a;
}

/** Invert an alpha buffer (returns a new buffer). */
export function invertAlpha(alpha: Uint8ClampedArray | Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(alpha.length);
  for (let i = 0; i < alpha.length; i++) out[i] = 255 - alpha[i];
  return out;
}

export interface MaskBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tight bounding box of the set pixels in an alpha buffer (alpha > threshold).
 * Returns null when nothing is set. Bounds are inclusive of the extreme pixels
 * (so a single set pixel yields a 1×1 box).
 */
export function maskBounds(
  alpha: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 8
): MaskBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Apply an alpha matte onto an RGBA image buffer, multiplying any existing alpha
 * by the matte (so a pre-multiplied cutout stays clean). Returns a NEW buffer;
 * the source is left untouched. Used by Magic Grab to lift a subject to a
 * transparent PNG.
 */
export function applyAlphaMatte(
  rgba: Uint8ClampedArray | Uint8Array,
  alpha: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  for (let i = 0; i < n; i++) {
    const prev = out[i * 4 + 3];
    out[i * 4 + 3] = Math.round((prev * alpha[i]) / 255);
  }
  return out;
}
