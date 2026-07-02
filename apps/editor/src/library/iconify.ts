// Iconify adapter — search the public API and resolve a recolorable .svg URL.
// The SVG endpoint returns a single-color icon (fill="currentColor"); our
// renderer's Layer-band fallback repaints every path from colors[0], so an
// inserted icon recolors through the Fill panel like any other clipart.

const BASE = "https://api.iconify.design";

export interface IconifySearchResponse {
  icons?: string[];
  total?: number;
}

/** Pure: pull the icon-id list ("prefix:name") out of a search response. */
export function mapIconifySearch(json: IconifySearchResponse | null | undefined): string[] {
  return Array.isArray(json?.icons) ? json!.icons! : [];
}

/** Build the recolorable SVG URL for an icon id like "mdi:home". */
export function iconifySvgUrl(id: string): string {
  const [prefix, ...rest] = id.split(":");
  const name = rest.join(":");
  return `${BASE}/${prefix}/${name}.svg`;
}

/** A small preview URL (grey icon) used for the results grid thumbnails. */
export function iconifyPreviewUrl(id: string): string {
  return `${iconifySvgUrl(id)}?color=%23c9c9d0&height=40`;
}

export async function searchIcons(
  query: string,
  limit = 48,
  signal?: AbortSignal
): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${BASE}/search?query=${encodeURIComponent(q)}&limit=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Iconify ${res.status}`);
  return mapIconifySearch(await res.json());
}
