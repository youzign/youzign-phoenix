// Legacy built-in clipart resolution: legacy designs reference the editor's
// built-in cliparts as relative `assets/graphics/<category>/<name>.swf` paths.
// The app can't render .swf, so these showed a placeholder / nothing. The
// rescued `_editor_assets/svg/` library holds SVG versions of most of them,
// bundled into apps/editor/public/legacy-clipart/. This module rewrites a
// matching `.swf` clipart source to the bundled SVG URL so the renderer's
// existing SVG path (packages/renderer clipart.ts `isSvgSource` + recolor)
// picks it up — recolor keeps working unchanged. Unmatched .swf sources are
// left untouched (current behavior).
//
// Pure (no DOM): the caller supplies `resolveUrl` (in the app, `asset()`), so
// this stays unit-testable and the base-path logic lives in one place.

import type { ClipartItem, Design, Item } from "@youzign/designstring";
import { LEGACY_CLIPART_MAP } from "./legacyClipartMap.js";

// A built-in clipart `.swf` appears in the real corpus in two shapes:
//   1. a RELATIVE path — `assets/graphics/<cat>/<name>.swf` or the
//      `../editors/assets/graphics/<cat>/<name>.swf` variant; and
//   2. a REMOTE URL to a 2015-era S3-offloaded copy whose filename is a 13-char
//      PHP uniqid() hash immediately followed by the built-in name, e.g.
//      `.../wp-content/uploads/x/2015/11/5644db5ca0655icon_phone.swf`.
// Both ultimately reference the SAME built-in clipart, so we resolve by the
// trailing clipart NAME (basename with any `<13-hex>` uniqid prefix stripped)
// and only accept it when that name is a known built-in in LEGACY_CLIPART_MAP —
// so user-uploaded `.swf` files (arbitrary names) are never touched.
const SWF_BASENAME_RE = /([^/?#]+)\.swf(?:[?#]|$)/i;
const UNIQID_PREFIX_RE = /^[0-9a-f]{13}(.+)$/;

/**
 * Resolve a legacy clipart `.swf` source (relative path or S3/B2 URL) to its
 * bundled SVG filename (e.g. "shapes_square.svg"), or `null` if it isn't a
 * known built-in clipart. `data:` sources (already-inlined) are ignored.
 */
export function resolveLegacyClipartFile(source: string): string | null {
  const trimmed = source.trim();
  if (!trimmed || /^data:/i.test(trimmed)) return null;
  const m = SWF_BASENAME_RE.exec(trimmed);
  if (!m) return null;
  const base = m[1].toLowerCase();
  if (LEGACY_CLIPART_MAP[base]) return LEGACY_CLIPART_MAP[base];
  const stripped = UNIQID_PREFIX_RE.exec(base);
  if (stripped && LEGACY_CLIPART_MAP[stripped[1]]) return LEGACY_CLIPART_MAP[stripped[1]];
  return null;
}

// Match a `source="..."` / `source='...'` attribute pointing at a `.swf`.
const SWF_SOURCE_ATTR_RE = /(\bsource\s*=\s*)(["'])([^"']*?\.swf(?:\?[^"']*)?)\2/gi;

/**
 * Rewrite built-in clipart `.swf` sources in a raw designstring XML to the
 * bundled SVG URLs, BEFORE the legacy asset URL-rewrite/inline pass — so the
 * S3/B2-hosted `.swf` copies are never fetched (they'd inline as an unrenderable
 * binary). Non-built-in `.swf` sources are left untouched. Pure: caller supplies
 * `resolveUrl` (the app's `asset()`).
 */
export function rewriteLegacyClipartSources(xml: string, resolveUrl: (file: string) => string): string {
  return xml.replace(SWF_SOURCE_ATTR_RE, (full, pre: string, quote: string, value: string) => {
    const file = resolveLegacyClipartFile(value);
    return file ? `${pre}${quote}${resolveUrl(`/legacy-clipart/${file}`)}${quote}` : full;
  });
}

function isClipart(item: Item): item is ClipartItem {
  return item.type === "clipart";
}

function remapItems(items: Item[], resolveUrl: (file: string) => string): Item[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.type === "group") {
      const nested = remapItems(item.items, resolveUrl);
      if (nested === item.items) return item;
      changed = true;
      return { ...item, items: nested };
    }
    // Only rewrite when there's no explicit sourceSvg already (the renderer
    // reads `sourceSvg || source`, so a present sourceSvg wins — leave it).
    if (isClipart(item) && !item.sourceSvg && item.source) {
      const file = resolveLegacyClipartFile(item.source);
      if (file) {
        changed = true;
        return { ...item, source: resolveUrl(`/legacy-clipart/${file}`) };
      }
    }
    return item;
  });
  return changed ? next : items;
}

/**
 * Rewrite legacy `.swf` clipart sources in a design to the bundled SVG URLs.
 * Items that don't match are returned unchanged, so this is cheap to call on
 * every document open (also fixes already-imported designs, since they're
 * re-parsed + re-remapped on load).
 */
export function remapLegacyClipartInDesign(
  design: Design,
  resolveUrl: (file: string) => string
): Design {
  const nextItems = remapItems(design.items, resolveUrl);
  if (nextItems === design.items) return design;
  return { ...design, items: nextItems };
}
