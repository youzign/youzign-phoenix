// Text effects: named presets that compose ONLY the legacy per-item attributes
// the renderer already understands — border (is_border/border_size/border_color),
// shadow (is_shadow/shadow_*), and the hollow-fill flag (isNoFill). No invented
// designstring attributes: an effect that can't be expressed in legacy attrs is
// simply not offered. This keeps every produced item byte-faithful on round-trip.
//
// The renderer's text drawing (packages/renderer items.tsx + effects.ts):
//   - border  → a `text-shadow` outline ring of radius border_size (blur 0).
//   - shadow  → a `filter: drop-shadow(dx dy 10px rgba(color,opacity))`, with
//               dx/dy from shadow_angle + shadow_distance.
//   - hollow  → when isNoFill && is_border && border_size > 1, glyph fill is
//               transparent so only the outline shows.
// Every effect below is therefore just a combination of those knobs.

import { hexToSignedInt } from "@youzign/designstring";
import type { ItemPatch } from "./mutations.js";

export type TextEffectId =
  | "none"
  | "outline"
  | "neon"
  | "sticker"
  | "hard-shadow"
  | "echo";

export interface TextEffectDef {
  id: TextEffectId;
  label: string;
}

/** Chip order in the Effects row (PropertiesPanel). */
export const TEXT_EFFECTS: TextEffectDef[] = [
  { id: "none", label: "None" },
  { id: "outline", label: "Outline" },
  { id: "neon", label: "Neon" },
  { id: "sticker", label: "Sticker" },
  { id: "hard-shadow", label: "Hard shadow" },
  { id: "echo", label: "Echo" },
];

/**
 * The full patch for an effect. `textHex` is the item's current fill so effects
 * that key off the text color (outline ring, neon glow, echo) stay in tune when
 * the user recolors. Every patch writes the COMPLETE effect surface (border +
 * shadow + fill) so switching between effects never leaves stale attributes.
 */
export function textEffectPatch(id: TextEffectId, textHex: string): ItemPatch {
  // Baseline: everything off. Each effect overrides the parts it needs.
  const off: ItemPatch = {
    isBorder: false,
    borderSize: 0,
    borderColor: 0,
    isShadow: false,
    shadowDistance: 0,
    shadowAngle: 45,
    shadowColor: 0,
    shadowOpacity: 1,
    isNoFill: false,
  };
  const ink = hexToSignedInt(textHex);
  const white = hexToSignedInt("#ffffff");
  const black = hexToSignedInt("#000000");

  switch (id) {
    case "none":
      return off;

    // Hollow letters: transparent fill, colored outline ring in the text color.
    case "outline":
      return {
        ...off,
        isBorder: true,
        borderSize: 3,
        borderColor: ink,
        isNoFill: true,
      };

    // Glow: a centered (distance 0) colored drop-shadow — the renderer's 10px
    // blur reads as a soft neon halo around the (still-filled) glyphs.
    case "neon":
      return {
        ...off,
        isShadow: true,
        shadowColor: ink,
        shadowDistance: 0,
        shadowOpacity: 1,
      };

    // Sticker: thick white outline hugging the colored fill, plus a soft grey
    // drop-shadow beneath for lift.
    case "sticker":
      return {
        ...off,
        isBorder: true,
        borderSize: 10,
        borderColor: white,
        isShadow: true,
        shadowColor: black,
        shadowDistance: 8,
        shadowAngle: 90,
        shadowOpacity: 0.3,
      };

    // Offset hard shadow ("NEW DROP!"): a solid dark shadow thrown down-right.
    case "hard-shadow":
      return {
        ...off,
        isShadow: true,
        shadowColor: black,
        shadowDistance: 12,
        shadowAngle: 45,
        shadowOpacity: 1,
      };

    // Echo: a same-color offset ghost of the text.
    case "echo":
      return {
        ...off,
        isShadow: true,
        shadowColor: ink,
        shadowDistance: 14,
        shadowAngle: 45,
        shadowOpacity: 0.5,
      };
  }
}

/**
 * Best-effort classification of an item's current effect attrs into a chip id,
 * for highlighting the active effect. Returns null when the attrs don't match a
 * named preset (i.e. the user hand-tuned border/shadow) so no chip lights up.
 */
export function detectTextEffect(item: {
  isBorder?: boolean;
  borderSize?: number;
  isShadow?: boolean;
  shadowDistance?: number;
  shadowOpacity?: number;
  isNoFill?: boolean;
}): TextEffectId | null {
  const border = !!item.isBorder && (item.borderSize ?? 0) > 0;
  const shadow = !!item.isShadow;
  const noFill = !!item.isNoFill;
  const dist = item.shadowDistance ?? 0;
  const op = item.shadowOpacity ?? 1;

  if (!border && !shadow && !noFill) return "none";
  if (border && noFill && !shadow) return "outline";
  if (border && shadow && (item.borderSize ?? 0) >= 8) return "sticker";
  if (!border && shadow) {
    if (dist === 0) return "neon";
    if (op >= 1) return "hard-shadow";
    return "echo";
  }
  return null;
}
