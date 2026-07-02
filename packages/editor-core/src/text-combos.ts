// Font combinations: the marquee "Text studio" feature. Each combo is a small
// set of 1–2 pre-styled text layers (a heading + optional subhead/attribution)
// inserted at the canvas centre in one click — the Canva "Font combinations"
// pattern (BUSINESS JOURNAL, neon MAGIC, hollow OUTLINE, sticker SUPER KAWAII,
// NEW DROP!, …).
//
// A combo is pure data: a list of layers, each a TextPreset plus an optional
// text-effect id and a vertical offset. `insertFontCombo` turns a def into
// fully-positioned TextItems (sequential z-index), applying effects through the
// same legacy-attr path used everywhere else — so combos are testable and every
// produced item round-trips byte-faithfully.

import type { Design, TextItem } from "@youzign/designstring";
import {
  createTextItem,
  patchItem,
  textColorHex,
  nextIndex,
  type TextPreset,
} from "./mutations.js";
import { textEffectPatch, type TextEffectId } from "./text-effects.js";

export interface FontComboLayer extends TextPreset {
  /** Optional named text effect applied after creation (legacy attrs only). */
  effect?: TextEffectId;
  /** Vertical offset from the canvas centre, in design px (default 0). */
  dy?: number;
}

export interface FontComboDef {
  id: string;
  /** Short human label (also the card's aria/title). */
  label: string;
  /** One or two pre-styled text layers, stacked top→bottom. */
  layers: FontComboLayer[];
}

// Ink tokens reused across combos.
const INK = "#1c1c1e";
const GOLD = "#b8860b";
const GRAPE = "#7c3aed";
const CORAL = "#f2585b";
const NEON = "#22d3ee";
const ACCENT = "#4f46e5";

/**
 * The curated set (14). Spans: serif editorial pair, script+sans pair, bold
 * hollow outline, neon glow, sticker, offset hard-shadow, rich solid
 * "gradient-feel", condensed poster caps, elegant golden serif, playful
 * rounded, minimal mono caption, quote+attribution, modern sans pair, retro.
 * Every `font` is present in GOOGLE_FONTS (fonts.ts).
 */
export const FONT_COMBOS: FontComboDef[] = [
  {
    id: "editorial",
    label: "Business Journal",
    layers: [
      { content: "Business Journal", font: "Playfair Display", size: 76, bold: true, color: INK, width: 720, dy: -30 },
      { content: "E S T A B L I S H E D   2 0 2 6", font: "EB Garamond", size: 22, color: "#6b7280", width: 720, dy: 44 },
    ],
  },
  {
    id: "script-sans",
    label: "Script + Sans",
    layers: [
      { content: "just a little", font: "Dancing Script", size: 56, color: CORAL, width: 640, dy: -34 },
      { content: "EXTRAORDINARY", font: "Montserrat", size: 40, bold: true, color: INK, width: 640, dy: 34 },
    ],
  },
  {
    id: "outline",
    label: "Bold Outline",
    layers: [
      { content: "OUTLINE", font: "Anton", size: 100, color: INK, width: 720, effect: "outline" },
    ],
  },
  {
    id: "neon",
    label: "Neon Glow",
    layers: [
      { content: "creating MAGIC", font: "Bebas Neue", size: 96, color: NEON, width: 760, effect: "neon" },
    ],
  },
  {
    id: "sticker",
    label: "Sticker",
    layers: [
      { content: "SUPER KAWAII", font: "Fredoka", size: 72, bold: true, color: CORAL, width: 720, effect: "sticker" },
    ],
  },
  {
    id: "drop",
    label: "New Drop!",
    layers: [
      { content: "NEW DROP!", font: "Archivo Black", size: 88, color: ACCENT, width: 760, effect: "hard-shadow" },
    ],
  },
  {
    id: "rich-solid",
    label: "Aurora",
    layers: [
      { content: "Aurora", font: "Playfair Display", size: 108, bold: true, italic: true, color: GRAPE, width: 720 },
    ],
  },
  {
    id: "poster",
    label: "Poster Caps",
    layers: [
      { content: "LIMITED EDITION", font: "Oswald", size: 68, bold: true, color: INK, width: 720, dy: -26 },
      { content: "drop three · this weekend only", font: "Oswald", size: 26, color: "#6b7280", width: 720, dy: 40 },
    ],
  },
  {
    id: "golden",
    label: "Golden Serif",
    layers: [
      { content: "Maison Doré", font: "Cormorant Garamond", size: 96, bold: true, color: GOLD, width: 760, dy: -24 },
      { content: "F I N E   J E W E L L E R Y", font: "Cormorant Garamond", size: 24, color: GOLD, width: 760, dy: 46 },
    ],
  },
  {
    id: "rounded",
    label: "Playful Rounded",
    layers: [
      { content: "hey there!", font: "Fredoka", size: 92, bold: true, color: CORAL, width: 720 },
    ],
  },
  {
    id: "mono",
    label: "Mono Caption",
    layers: [
      { content: "01 — INDEX / 2026", font: "Space Mono", size: 28, color: "#6b7280", width: 560 },
    ],
  },
  {
    id: "quote",
    label: "Quote + Author",
    layers: [
      { content: "“Design is intelligence made visible.”", font: "Libre Baskerville", size: 40, italic: true, color: INK, width: 640, dy: -30 },
      { content: "— ALINA WHEELER", font: "Montserrat", size: 20, bold: true, color: "#6b7280", width: 640, dy: 54 },
    ],
  },
  {
    id: "modern-sans",
    label: "Modern Sans",
    layers: [
      { content: "Portfolio", font: "Montserrat", size: 84, bold: true, color: INK, width: 720, dy: -26 },
      { content: "2 0 2 6   C O L L E C T I O N", font: "Raleway", size: 22, color: "#6b7280", width: 720, dy: 42 },
    ],
  },
  {
    id: "retro",
    label: "Retro",
    layers: [
      { content: "Retro Vibes", font: "Abril Fatface", size: 96, color: "#c2410c", width: 760 },
    ],
  },
];

export function getFontCombo(id: string): FontComboDef | undefined {
  return FONT_COMBOS.find((c) => c.id === id);
}

/** Every family used by the combo set — for eager webfont preloading. */
export function fontComboFamilies(): string[] {
  const set = new Set<string>();
  for (const combo of FONT_COMBOS)
    for (const layer of combo.layers) if (layer.font) set.add(layer.font);
  return [...set];
}

/**
 * Build the positioned, effect-applied text layers for a combo, centred on the
 * canvas. Pure: returns fully-formed TextItems with sequential indices so the
 * store can push + select them (mirrors insertCombo).
 */
export function insertFontCombo(design: Design, id: string): TextItem[] {
  const def = getFontCombo(id);
  if (!def) return [];
  const cx = design.canvasWidth / 2;
  const cy = design.canvasHeight / 2;
  const base = nextIndex(design);
  const items: TextItem[] = [];

  for (const layer of def.layers) {
    const { effect, dy, ...preset } = layer;
    const item = createTextItem(design, cx, cy + (dy ?? 0), preset as TextPreset);
    patchItem(item as any, { index: base + items.length });
    if (effect && effect !== "none") {
      patchItem(item as any, textEffectPatch(effect, textColorHex(item)));
    }
    items.push(item);
  }
  return items;
}
