import { keyColorAlpha, sampleBorderColor } from "@youzign/editor-core";
import { BgRemovalError } from "./removeBackground.js";

interface ColorKeyOptions {
  maxSide?: number;
}

/** Load an image source into a readable canvas, honouring CORS. */
function loadPixels(
  source: string,
  maxSide: number
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const nW = img.naturalWidth || img.width;
      const nH = img.naturalHeight || img.height;
      if (!nW || !nH) return reject(new BgRemovalError("Image has no pixels."));
      const scale = Math.min(1, maxSide / Math.max(nW, nH));
      const width = Math.max(1, Math.round(nW * scale));
      const height = Math.max(1, Math.round(nH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new BgRemovalError("Canvas unavailable."));
      ctx.drawImage(img, 0, 0, width, height);
      let data: ImageData;
      try {
        data = ctx.getImageData(0, 0, width, height);
      } catch {
        return reject(
          new BgRemovalError("Image is cross-origin protected and can't be read.")
        );
      }
      resolve({ rgba: data.data, width, height });
    };
    img.onerror = () =>
      reject(new BgRemovalError("Couldn't load the image (blocked or offline)."));
    img.src = source;
  });
}

/**
 * Make one chosen color transparent and return a PNG data-URI with alpha.
 * When `target` is omitted, the image border is sampled as the background.
 */
export async function makeColorTransparent(
  source: string,
  target: { r: number; g: number; b: number } | undefined,
  tolerance: number,
  opts: ColorKeyOptions = {}
): Promise<string> {
  const maxSide = opts.maxSide ?? 1600;
  const { rgba, width, height } = await loadPixels(source, maxSide);
  const key = target ?? sampleBorderColor(rgba, width, height);
  const keyed = keyColorAlpha(rgba, width, height, key, tolerance);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const octx = outCanvas.getContext("2d");
  if (!octx) throw new BgRemovalError("Canvas unavailable.");
  octx.putImageData(new ImageData(new Uint8ClampedArray(keyed), width, height), 0, 0);
  return outCanvas.toDataURL("image/png");
}
