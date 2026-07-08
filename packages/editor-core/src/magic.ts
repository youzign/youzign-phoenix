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

/** Auto-detect the dominant background color by sampling the image's border pixels. */
export function sampleBorderColor(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): { r: number; g: number; b: number } {
  if (width <= 0 || height <= 0) return { r: 0, g: 0, b: 0 };

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const addPixel = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    r += rgba[o];
    g += rgba[o + 1];
    b += rgba[o + 2];
    count++;
  };

  for (let x = 0; x < width; x++) {
    addPixel(x, 0);
    if (height > 1) addPixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    addPixel(0, y);
    if (width > 1) addPixel(width - 1, y);
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

/**
 * Return a new RGBA buffer where pixels close to `target` are made transparent,
 * with a soft alpha ramp over the outer half of the tolerance band.
 */
export function keyColorAlpha(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  target: { r: number; g: number; b: number },
  tolerance: number
): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  const t = Math.max(0, Math.min(255, tolerance));
  const inner = t * 0.5;
  const ramp = Math.max(1, t - inner);
  const tr = Math.max(0, Math.min(255, target.r));
  const tg = Math.max(0, Math.min(255, target.g));
  const tb = Math.max(0, Math.min(255, target.b));

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const dr = rgba[o] - tr;
    const dg = rgba[o + 1] - tg;
    const db = rgba[o + 2] - tb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const alpha = rgba[o + 3];

    if (t === 0) {
      if (dist === 0) out[o + 3] = 0;
    } else if (dist <= inner) {
      out[o + 3] = 0;
    } else if (dist < t) {
      out[o + 3] = Math.round(alpha * ((dist - inner) / ramp));
    }
  }

  return out;
}

/**
 * In-place Gaussian blur of an RGBA buffer, approximated by three box-blur
 * passes (Kutskir's method — indistinguishable from true Gaussian at these
 * radii). `sigma` matches CSS `blur(<px>)` semantics (standard deviation), so
 * results track `ctx.filter = "blur(...)"` where that exists. Needed because
 * WebKit (Safari / the desktop app's WKWebView) never implemented
 * CanvasRenderingContext2D.filter — there it silently no-ops.
 */
export function gaussianBlurRGBA(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number
): void {
  if (sigma <= 0 || width <= 0 || height <= 0) return;
  const n = width * height;
  const src = new Float32Array(n);
  const tmp = new Float32Array(n);
  const boxes = boxesForGauss(sigma, 3);
  for (let ch = 0; ch < 4; ch++) {
    for (let i = 0; i < n; i++) src[i] = data[i * 4 + ch];
    for (const size of boxes) {
      const r = (size - 1) / 2;
      boxBlurPass(src, tmp, width, height, Math.min(r, Math.floor((width - 1) / 2)), true);
      boxBlurPass(tmp, src, width, height, Math.min(r, Math.floor((height - 1) / 2)), false);
    }
    for (let i = 0; i < n; i++) data[i * 4 + ch] = src[i];
  }
}

/** Box sizes (odd widths) whose n passes best approximate a Gaussian of stddev sigma. */
function boxesForGauss(sigma: number, n: number): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

/** One running-sum box-blur pass, horizontal or vertical, with clamped edges. */
function boxBlurPass(
  src: Float32Array,
  dst: Float32Array,
  width: number,
  height: number,
  r: number,
  horizontal: boolean
): void {
  if (r <= 0) {
    dst.set(src);
    return;
  }
  const lines = horizontal ? height : width;
  const len = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  const iarr = 1 / (r + r + 1);
  for (let i = 0; i < lines; i++) {
    const base = horizontal ? i * width : i;
    let ti = base;
    let li = base;
    let ri = base + r * stride;
    const fv = src[base];
    const lv = src[base + (len - 1) * stride];
    let val = (r + 1) * fv;
    for (let j = 0; j < r; j++) val += src[base + j * stride];
    for (let j = 0; j <= r; j++) {
      val += src[ri] - fv;
      ri += stride;
      dst[ti] = val * iarr;
      ti += stride;
    }
    for (let j = r + 1; j < len - r; j++) {
      val += src[ri] - src[li];
      ri += stride;
      li += stride;
      dst[ti] = val * iarr;
      ti += stride;
    }
    for (let j = len - r; j < len; j++) {
      val += lv - src[li];
      li += stride;
      dst[ti] = val * iarr;
      ti += stride;
    }
  }
}
