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
    throw new MagicError(`fal.ai request failed (${res.status}).`);
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
