// fal.ai text-to-image adapter (client-side BYOK). Mirrors the photos.ts shape:
// pure `buildFalRequest` / `mapFalResponse` functions are unit-tested, and
// `generate()` performs the fetch. The key is read from localStorage settings
// and passed in by the caller — never bundled.
//
// Text-to-image uses Google's nano-banana 2 lite endpoint on fal.
// fal's HTTP API: POST https://fal.run/<model>  with  Authorization: Key <key>.

/** A single generated image, normalized to the fields the canvas needs. */
export interface GenResult {
  id: string;
  url: string;
  width: number;
  height: number;
}

/** Aspect presets matched to common canvas uses. */
export interface AspectPreset {
  id: "square" | "landscape" | "portrait";
  label: string;
  aspect_ratio: "1:1" | "16:9" | "9:16";
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: "square", label: "Square", aspect_ratio: "1:1" },
  { id: "landscape", label: "Landscape", aspect_ratio: "16:9" },
  { id: "portrait", label: "Portrait", aspect_ratio: "9:16" },
];

/** Default fal model slug (used to build the endpoint URL). */
export const FAL_MODEL = "google/nano-banana-2-lite";

/** Image-to-image edit model: Google's nano-banana 2 lite edit endpoint on fal.
 *  Accepts a prompt + an `image_urls` array of reference images. Base64 data
 *  URIs are decoded server-side, so uploads/canvas sources go straight in — no
 *  separate file-upload step needed (verified against the live endpoint). */
export const FAL_EDIT_MODEL = "google/nano-banana-2-lite/edit";

/** Max reference images the edit flow accepts (owner spec). */
export const MAX_EDIT_IMAGES = 10;

export const FAL_KEY_URL = "https://fal.ai/dashboard/keys";

export interface FalRequest {
  prompt: string;
  aspect_ratio: AspectPreset["aspect_ratio"];
}

/** Pure request-payload builder (unit-tested). */
export function buildFalRequest(prompt: string, preset: AspectPreset): FalRequest {
  return {
    prompt: prompt.trim(),
    aspect_ratio: preset.aspect_ratio,
  };
}

/** Pure response mapper: fal returns `{ images: [{ url, width, height }] }`.
 *  Tolerates missing fields and falls back to the requested dimensions. */
export function mapFalResponse(
  json: any,
  fallback?: { width: number; height: number }
): GenResult[] {
  const images = Array.isArray(json?.images) ? json.images : [];
  return images
    .filter((im: any) => im && typeof im.url === "string" && im.url)
    .map((im: any, i: number) => ({
      id: `${json?.seed ?? "gen"}-${i}-${im.url.length}`,
      url: im.url as string,
      width: Number(im.width) || fallback?.width || 1024,
      height: Number(im.height) || fallback?.height || 1024,
    }));
}

/* ----------------------------- image-to-image ---------------------------- */

export interface FalEditRequest {
  prompt: string;
  image_urls: string[];
  num_images: number;
}

/** Clamp a reference-image list to at most `max` entries (drops the overflow,
 *  keeping the first ones). Pure — used by the request builder and the UI's
 *  add-image guard so the two never disagree on the ceiling. */
export function clampImages<T>(images: T[], max = MAX_EDIT_IMAGES): T[] {
  return images.slice(0, Math.max(0, max));
}

/** Pure request-payload builder for the edit endpoint (unit-tested). Trims the
 *  prompt and clamps to the reference-image ceiling. */
export function buildFalEditRequest(
  prompt: string,
  imageUrls: string[],
  numImages = 1
): FalEditRequest {
  return {
    prompt: prompt.trim(),
    image_urls: clampImages(imageUrls),
    num_images: numImages,
  };
}

/** Runs an image edit/composition against the nano-banana edit endpoint. The
 *  reference images may be https urls OR base64 data URIs (decoded server-side).
 *  Throws on non-OK / network failure so the caller shows a designed error. */
export async function editImages(
  prompt: string,
  imageUrls: string[],
  key: string,
  signal?: AbortSignal
): Promise<GenResult[]> {
  const body = buildFalEditRequest(prompt, imageUrls);
  const res = await fetch(`https://fal.run/${FAL_EDIT_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`fal ${res.status}`);
  return mapFalResponse(await res.json());
}

/** Performs the generation. Throws on non-OK / network (incl. CORS) failure so
 *  the caller can show a designed error state. */
export async function generate(
  prompt: string,
  preset: AspectPreset,
  key: string,
  signal?: AbortSignal
): Promise<GenResult[]> {
  const body = buildFalRequest(prompt, preset);
  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`fal ${res.status}`);
  return mapFalResponse(await res.json());
}
