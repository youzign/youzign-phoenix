// Legacy font loader: resolve legacy Youzign font names (CamelCase, mangled
// spacing) to real Google Fonts families and rewrite them onto the parsed
// document so the EXISTING font pipeline picks them up unmodified —
// `EditorView`'s `collectFonts` + `ensureGoogleFonts` effect (apps/editor/src/App.tsx)
// injects the Google Fonts stylesheet, and `CanvasStage`'s `fonts.load()` effect
// (apps/editor/src/components/CanvasStage.tsx) waits for the face before the
// canvas measures text. `packages/renderer` reads `item.font` verbatim as the
// CSS font-family, so the rewrite has to happen upstream of the renderer, not
// inside it — nothing in packages/renderer changes.
//
// This module is pure (no DOM) so it's unit-testable; the DOM side
// (stylesheet injection) is already `ensureGoogleFonts` in `../fonts.ts`.

import type { Design, Item, TextCurvedItem, TextItem } from "@youzign/designstring";
import { LEGACY_FONT_MAP, LEGACY_SELF_HOST_FONTS } from "./legacyFontMap.js";

export interface SelfHostFont {
  family: string;
  file: string;
}

const isTextItem = (item: Item): item is TextItem | TextCurvedItem =>
  item.type === "text" || item.type === "text-curved";

function normalizeKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// Case/space-insensitive index built once from LEGACY_FONT_MAP.
const NORMALIZED_MAP = new Map<string, string>();
for (const [legacyName, family] of Object.entries(LEGACY_FONT_MAP)) {
  NORMALIZED_MAP.set(normalizeKey(legacyName), family);
}

// Case/space-insensitive index of the SELF-HOSTED legacy fonts (no Google
// equivalent — served from apps/editor/public/legacy-fonts/).
const NORMALIZED_SELF_HOST = new Map<string, SelfHostFont>();
for (const [legacyName, entry] of Object.entries(LEGACY_SELF_HOST_FONTS)) {
  NORMALIZED_SELF_HOST.set(normalizeKey(legacyName), entry);
}

const loggedUnmapped = new Set<string>();

/**
 * Resolve a legacy font name to its real Google Fonts family, or `null` if
 * there's no known mapping (current sans fallback keeps rendering, no crash).
 */
export function resolveLegacyFont(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (LEGACY_FONT_MAP[trimmed]) return LEGACY_FONT_MAP[trimmed];
  const byNormalizedKey = NORMALIZED_MAP.get(normalizeKey(trimmed));
  return byNormalizedKey ?? null;
}

/**
 * Resolve a legacy font name to a SELF-HOSTED font (family + bundled woff2
 * filename), or `null`. These have no Google Fonts equivalent; we ship the
 * original files the legacy product used.
 */
export function resolveSelfHostFont(name: string): SelfHostFont | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (LEGACY_SELF_HOST_FONTS[trimmed]) return LEGACY_SELF_HOST_FONTS[trimmed];
  return NORMALIZED_SELF_HOST.get(normalizeKey(trimmed)) ?? null;
}

/** Walk a design's item tree (including nested groups) collecting distinct `font` values. */
export function collectFontNames(items: Item[], out: Set<string> = new Set()): Set<string> {
  for (const item of items) {
    if (item.type === "group") collectFontNames(item.items, out);
    else if (isTextItem(item) && item.font) out.add(item.font);
  }
  return out;
}

function remapItems(items: Item[]): Item[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.type === "group") {
      const nestedItems = remapItems(item.items);
      if (nestedItems === item.items) return item;
      changed = true;
      return { ...item, items: nestedItems };
    }
    if (isTextItem(item) && item.font) {
      const resolved = resolveLegacyFont(item.font);
      if (resolved && resolved !== item.font) {
        changed = true;
        return { ...item, font: resolved };
      }
      if (!resolved) {
        // Fall back to a self-hosted legacy font before giving up. Rewrite the
        // (possibly mangled) name to the canonical family we register the
        // @font-face under, so the injected face and the renderer agree.
        const selfHost = resolveSelfHostFont(item.font);
        if (selfHost && selfHost.family !== item.font) {
          changed = true;
          return { ...item, font: selfHost.family };
        }
        if (!selfHost && !loggedUnmapped.has(item.font)) {
          loggedUnmapped.add(item.font);
          // eslint-disable-next-line no-console
          console.warn(`[legacyFonts] no mapping for legacy font "${item.font}" — using fallback`);
        }
      }
    }
    return item;
  });
  return changed ? next : items;
}

/**
 * Rewrite legacy font names in a single design's items to their resolved
 * Google Fonts family, in place of the item objects that need changing
 * (unrelated items are returned unchanged, so this is cheap to call on every
 * document open). Unmappable names are left as-is — same fallback behavior as
 * today — and logged once per distinct name.
 */
export function remapLegacyFontsInDesign(design: Design): Design {
  const nextItems = remapItems(design.items);
  if (nextItems === design.items) return design;
  return { ...design, items: nextItems };
}

/** Distinct resolved (post-remap) Google Fonts families used by a design — what to hand to `ensureGoogleFonts`. */
export function legacyDesignFontFamilies(design: Design): string[] {
  return Array.from(collectFontNames(design.items));
}

/**
 * Distinct SELF-HOSTED legacy fonts referenced by the items (matched by the
 * font names as they appear — post-remap these are the canonical families, but
 * this also resolves raw/mangled names so it's safe pre- or post-remap). Hand
 * the result to `ensureLegacyFonts` (legacyFontFaces.ts) to inject @font-face.
 */
export function collectSelfHostFonts(items: Item[]): SelfHostFont[] {
  const byFamily = new Map<string, SelfHostFont>();
  for (const name of collectFontNames(items)) {
    const entry = resolveSelfHostFont(name);
    if (entry) byFamily.set(entry.family, entry);
  }
  return Array.from(byFamily.values());
}
