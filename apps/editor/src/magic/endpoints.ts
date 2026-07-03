// fal.ai adapters for the Magic suite (client-side BYOK — same direct-fetch
// pattern as library/generate.ts; the key is read from localStorage by the
// caller and never bundled). Both endpoints chosen here were validated
// empirically against real fal responses:
//
//   • Magic Eraser  → fal-ai/bria/eraser  (dedicated content-aware object
//       removal; takes image + mask, NO prompt; ~6s; clean seamless fill —
//       far better than flux-fill/flux-general which hallucinate content, and
//       ~15× faster than fooocus/inpaint). Response: { image: { url } }.
//   • Magic Grab    → fal-ai/sam2/image   (Segment Anything v2, point-prompt;
//       ~1.2s; returns a crisp white-on-black binary mask PNG). The extracted
//       subject + original hole-fill are then composited/erased locally.
//       Response: { image: { url } }.
//
// Both are synchronous on fal.run (no queue polling needed at these sizes).

const FAL_BASE = "https://fal.run";

export const MAGIC_ERASE_MODEL = "fal-ai/bria/eraser";
export const MAGIC_SEGMENT_MODEL = "fal-ai/sam2/image";
export const MAGIC_EDIT_MODEL = "fal-ai/flux-pro/v1/fill";
export const MAGIC_EXPAND_MODEL = "fal-ai/bria/expand";
export const MAGIC_UPSCALE_MODEL = "fal-ai/clarity-upscaler";

export type MagicExpandRatio = "1:1" | "4:5" | "16:9" | "9:16" | "free";

export interface ExpandPlan {
  canvasWidth: number;
  canvasHeight: number;
  originalX: number;
  originalY: number;
  originalWidth: number;
  originalHeight: number;
}

export function buildMagicEditRequest(image: string, mask: string, prompt: string) {
  return {
    image_url: image,
    mask_url: mask,
    prompt: prompt.trim(),
    num_images: 1,
    enable_safety_checker: true,
  };
}

function ratioValue(ratio: MagicExpandRatio, fallback: number): number {
  if (ratio === "1:1") return 1;
  if (ratio === "4:5") return 4 / 5;
  if (ratio === "16:9") return 16 / 9;
  if (ratio === "9:16") return 9 / 16;
  return fallback;
}

export function planExpand(
  imageWidth: number,
  imageHeight: number,
  ratio: MagicExpandRatio,
  fallbackRatio: number
): ExpandPlan {
  const targetRatio = ratioValue(ratio, fallbackRatio);
  const baseW = Math.max(1, Math.round(imageWidth));
  const baseH = Math.max(1, Math.round(imageHeight));
  const twoXW = baseW * 2;
  const twoXH = baseH * 2;
  let canvasWidth = twoXW;
  let canvasHeight = Math.round(canvasWidth / targetRatio);
  if (canvasHeight < baseH) {
    canvasHeight = twoXH;
    canvasWidth = Math.round(canvasHeight * targetRatio);
  }
  canvasWidth = Math.max(baseW, canvasWidth);
  canvasHeight = Math.max(baseH, canvasHeight);
  return {
    canvasWidth,
    canvasHeight,
    originalX: Math.round((canvasWidth - baseW) / 2),
    originalY: Math.round((canvasHeight - baseH) / 2),
    originalWidth: baseW,
    originalHeight: baseH,
  };
}

export function buildMagicExpandRequest(image: string, plan: ExpandPlan) {
  return {
    image_url: image,
    // bria/expand wants [w,h] / [x,y] arrays, not objects (422 otherwise).
    canvas_size: [plan.canvasWidth, plan.canvasHeight],
    original_image_size: [plan.originalWidth, plan.originalHeight],
    original_image_location: [plan.originalX, plan.originalY],
  };
}

export function buildMagicUpscaleRequest(image: string) {
  return {
    image_url: image,
    upscale_factor: 2,
    creativity: 0.2,
    resemblance: 0.75,
    guidance_scale: 4,
    num_inference_steps: 18,
  };
}

export class MagicError extends Error {}

async function falPost(
  model: string,
  body: unknown,
  key: string,
  signal?: AbortSignal
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${FAL_BASE}/${model}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as any)?.name === "AbortError") throw e;
    throw new MagicError("Couldn't reach fal.ai (offline or blocked).");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403)
      throw new MagicError("fal.ai rejected your key — check it in Connect fal.ai.");
    let detail = "";
    try {
      const body = await res.json();
      detail = JSON.stringify(body.detail ?? body).slice(0, 300);
    } catch {
      /* body not json */
    }
    throw new MagicError(`fal.ai request failed (${res.status})${detail ? `: ${detail}` : "."}`);
  }
  return res.json();
}

/** Extract the single result image URL from either response shape fal uses. */
function resultUrl(json: any): string {
  const url = json?.image?.url ?? json?.images?.[0]?.url;
  if (typeof url !== "string" || !url) throw new MagicError("fal.ai returned no image.");
  return url;
}

/**
 * Erase the masked region of an image (content-aware object removal). `image`
 * and `mask` may each be a remote URL or a data-URI. Returns the URL of the
 * cleaned image.
 */
export async function eraseRegion(
  image: string,
  mask: string,
  key: string,
  signal?: AbortSignal
): Promise<string> {
  const json = await falPost(
    MAGIC_ERASE_MODEL,
    { image_url: image, mask_url: mask },
    key,
    signal
  );
  return resultUrl(json);
}

/** Replace the masked region using a prompt-guided inpaint model. */
export async function editRegion(
  image: string,
  mask: string,
  prompt: string,
  key: string,
  signal?: AbortSignal
): Promise<string> {
  const json = await falPost(
    MAGIC_EDIT_MODEL,
    buildMagicEditRequest(image, mask, prompt),
    key,
    signal
  );
  return resultUrl(json);
}

/** Outpaint an image into a larger canvas. */
export async function expandImage(
  image: string,
  plan: ExpandPlan,
  key: string,
  signal?: AbortSignal
): Promise<string> {
  const json = await falPost(
    MAGIC_EXPAND_MODEL,
    buildMagicExpandRequest(image, plan),
    key,
    signal
  );
  return resultUrl(json);
}

/** Enhance/upscale a raster image. */
export async function upscaleImage(
  image: string,
  key: string,
  signal?: AbortSignal
): Promise<string> {
  const json = await falPost(
    MAGIC_UPSCALE_MODEL,
    buildMagicUpscaleRequest(image),
    key,
    signal
  );
  return resultUrl(json);
}

/**
 * Segment the subject under a point (image-space pixel coordinates). Returns the
 * URL of a white-on-black binary mask PNG at the image's resolution.
 */
export async function segmentAtPoint(
  image: string,
  x: number,
  y: number,
  key: string,
  signal?: AbortSignal
): Promise<string> {
  const json = await falPost(
    MAGIC_SEGMENT_MODEL,
    { image_url: image, prompts: [{ x: Math.round(x), y: Math.round(y), label: 1 }] },
    key,
    signal
  );
  return resultUrl(json);
}
