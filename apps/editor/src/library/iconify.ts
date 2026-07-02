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

/** A small preview URL (grey icon) used for the monochrome/Line results grid. */
export function iconifyPreviewUrl(id: string): string {
  return `${iconifySvgUrl(id)}?color=%23c9c9d0&height=40`;
}

/** Preview URL that keeps the icon's own colors (Color style). */
export function iconifyColorPreviewUrl(id: string): string {
  return `${iconifySvgUrl(id)}?height=40`;
}

// Icon style dimension. "Color" = designed, multi-color sets that must NOT be
// recolored (they insert with an empty colors array so the renderer preserves
// their fills). "Line" = monochrome sets that recolor through the Fill panel.
export type IconStyle = "color" | "line";

/** Curated set prefixes per style (verified to respond on api.iconify.design). */
export const STYLE_PREFIXES: Record<IconStyle, string[]> = {
  // flat-color-icons (Freepik-flavored) first, then emoji-style designed sets.
  color: ["flat-color-icons", "logos", "twemoji", "noto"],
  line: ["lucide", "tabler", "ph", "mdi"],
};

/** Category chips → canned searches so the tab is never an empty search box. */
export const ICON_CATEGORIES = [
  "Business",
  "Arrow",
  "Social",
  "Weather",
  "Food",
  "People",
  "Tech",
  "Heart",
] as const;

/**
 * A curated default grid of colorful flat-color-icons so the Color style opens
 * pre-populated with an inviting, guaranteed-full grid.
 */
export const DEFAULT_COLOR_ICONS: string[] = [
  "flat-color-icons:like",
  "flat-color-icons:idea",
  "flat-color-icons:shop",
  "flat-color-icons:calendar",
  "flat-color-icons:camera",
  "flat-color-icons:conference-call",
  "flat-color-icons:money-transfer",
  "flat-color-icons:phone",
  "flat-color-icons:home",
  "flat-color-icons:settings",
  "flat-color-icons:search",
  "flat-color-icons:feedback",
  "flat-color-icons:rating",
  "flat-color-icons:business",
  "flat-color-icons:briefcase",
  "flat-color-icons:clock",
  "flat-color-icons:bookmark",
  "flat-color-icons:gallery",
  "flat-color-icons:music",
  "flat-color-icons:video-call",
  "flat-color-icons:document",
  "flat-color-icons:folder",
  "flat-color-icons:print",
  "flat-color-icons:info",
  "flat-color-icons:approval",
  "flat-color-icons:bar-chart",
  "flat-color-icons:pie-chart",
  "flat-color-icons:globe",
  "flat-color-icons:contacts",
  "flat-color-icons:alarm-clock",
];

export async function searchIcons(
  query: string,
  limit = 48,
  signal?: AbortSignal,
  prefixes?: string[]
): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];
  const pfx = prefixes?.length ? `&prefixes=${prefixes.join(",")}` : "";
  const url = `${BASE}/search?query=${encodeURIComponent(q)}&limit=${limit}${pfx}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Iconify ${res.status}`);
  return mapIconifySearch(await res.json());
}

/** True when an icon id belongs to a Color (multi-color) set. */
export function isColorIcon(id: string): boolean {
  const prefix = id.split(":")[0];
  return STYLE_PREFIXES.color.includes(prefix);
}
