// fal.ai text-to-image adapter (client-side BYOK). Mirrors the photos.ts shape:
// pure `buildFalRequest` / `mapFalResponse` functions are unit-tested, and
// `generate()` performs the fetch. The key is read from localStorage settings
// and passed in by the caller — never bundled.
//
// v1 default model is flux/schnell: fast, cheap, good enough for layout comps.
// fal's HTTP API: POST https://fal.run/<model>  with  Authorization: Key <key>.

/** A single generated image, normalized to the fields the canvas needs. */
export interface GenResult {
  id: string;
  url: string;
  width: number;
  height: number;
}

/** Aspect presets matched to common canvas uses. Dimensions are flux-friendly
 *  (multiples of 32, ~1MP) so schnell renders them without upscaling. */
export interface AspectPreset {
  id: "square" | "landscape" | "portrait";
  label: string;
  width: number;
  height: number;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: "square", label: "Square", width: 1024, height: 1024 },
  { id: "landscape", label: "Landscape", width: 1344, height: 768 },
  { id: "portrait", label: "Portrait", width: 768, height: 1344 },
];

/** Default fal model slug (used to build the endpoint URL). */
export const FAL_MODEL = "fal-ai/flux/schnell";

export const FAL_KEY_URL = "https://fal.ai/dashboard/keys";

export interface FalRequest {
  prompt: string;
  image_size: { width: number; height: number };
  num_images: number;
  enable_safety_checker: boolean;
}

/** Pure request-payload builder (unit-tested). */
export function buildFalRequest(prompt: string, preset: AspectPreset): FalRequest {
  return {
    prompt: prompt.trim(),
    image_size: { width: preset.width, height: preset.height },
    num_images: 1,
    enable_safety_checker: true,
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
  return mapFalResponse(await res.json(), body.image_size);
}
