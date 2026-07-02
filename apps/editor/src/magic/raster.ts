// Client-side canvas rasterisation for the Magic suite. The pure per-pixel math
// lives in @youzign/editor-core (magic.ts); this module owns the DOM canvas +
// image loading. All bakes are PNG data-URIs so they round-trip through
// applySource (undo restores the prior source).

import {
  maskLuminanceAlpha,
  maskThresholdAlpha,
  maskBounds,
  applyAlphaMatte,
  type MaskBounds,
} from "@youzign/editor-core";

export class RasterError extends Error {}

/** Load an image source into a readable, CORS-safe HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new RasterError("Couldn't load the image."));
    img.src = src;
  });
}

/** Draw an image into a canvas at the given size and read back its RGBA. */
function pixelsOf(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new RasterError("Canvas unavailable.");
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    throw new RasterError("Image is cross-origin protected and can't be read.");
  }
}

/**
 * Fetch a (CORS-enabled) image URL and inline it as a PNG/JPEG data-URI, so a
 * baked result no longer depends on the fal CDN and round-trips through undo.
 */
export async function toDataUri(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  let blob: Blob;
  try {
    blob = await (await fetch(url)).blob();
  } catch {
    throw new RasterError("Couldn't download the result image.");
  }
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new RasterError("Couldn't read the result image."));
    fr.readAsDataURL(blob);
  });
}

export interface Stroke {
  points: { x: number; y: number }[];
  /** brush radius in the same coordinate space as the points */
  radius: number;
}

/**
 * Rasterise brush strokes (points in target-image pixel space) into a
 * white-on-black mask PNG data-URI sized `width`×`height`. Round caps/joins so
 * the painted region reads as a continuous smear.
 */
export function strokesToMaskDataUri(
  strokes: Stroke[],
  width: number,
  height: number
): string {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new RasterError("Canvas unavailable.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const s of strokes) {
    if (s.points.length === 0) continue;
    ctx.lineWidth = s.radius * 2;
    if (s.points.length === 1) {
      const p = s.points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
  }
  return c.toDataURL("image/png");
}

/** Does a mask (any strokes) contain painted pixels? */
export function hasStrokes(strokes: Stroke[]): boolean {
  return strokes.some((s) => s.points.length > 0);
}

export interface SubjectExtract {
  /** transparent PNG data-URI, cropped tight to the subject */
  dataUri: string;
  /** subject bounds in the source image's pixel space */
  bounds: MaskBounds;
  /** natural size of the source image the mask was measured against */
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Lift the masked subject out of an image into a tightly-cropped transparent
 * PNG. `maskSrc` is a white-on-black mask (SAM2 output) at the image's aspect.
 */
export async function extractSubject(
  imageSrc: string,
  maskSrc: string
): Promise<SubjectExtract> {
  const [img, mask] = await Promise.all([loadImage(imageSrc), loadImage(maskSrc)]);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const imgPx = pixelsOf(img, w, h);
  const maskPx = pixelsOf(mask, w, h);

  const soft = maskLuminanceAlpha(maskPx, w, h);
  const hard = maskThresholdAlpha(maskPx, w, h);
  const bounds = maskBounds(hard, w, h);
  if (!bounds) throw new RasterError("No subject found under that point.");

  const matted = applyAlphaMatte(imgPx, soft, w, h);

  // Crop tight to the subject bounds.
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  full.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(matted), w, h), 0, 0);

  const crop = document.createElement("canvas");
  crop.width = bounds.width;
  crop.height = bounds.height;
  crop
    .getContext("2d")!
    .drawImage(full, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);

  return {
    dataUri: crop.toDataURL("image/png"),
    bounds,
    sourceWidth: w,
    sourceHeight: h,
  };
}

/**
 * Composite a background-blurred version of an image with a sharp subject
 * cutout on top. `cutoutSrc` is the subject-with-alpha PNG (from local U²-Netp
 * bg-removal). Returns a baked PNG data-URI at the cutout's resolution.
 */
export async function blurBackgroundComposite(
  imageSrc: string,
  cutoutSrc: string,
  blurPx: number
): Promise<string> {
  const [img, cut] = await Promise.all([loadImage(imageSrc), loadImage(cutoutSrc)]);
  const w = cut.naturalWidth || cut.width;
  const h = cut.naturalHeight || cut.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new RasterError("Canvas unavailable.");
  // Blurred background (full image scaled to the cutout resolution).
  ctx.filter = `blur(${Math.max(0, blurPx)}px)`;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = "none";
  // Sharp subject on top.
  ctx.drawImage(cut, 0, 0, w, h);
  try {
    return c.toDataURL("image/png");
  } catch {
    throw new RasterError("Image is cross-origin protected and can't be read.");
  }
}
