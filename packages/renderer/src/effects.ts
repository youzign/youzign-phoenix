// Faithful port of the legacy editor's per-item effect rendering
// (`updateItemStyle` in the 2017 editor's Main.ts).
//
// Legacy semantics (all lengths in design pixels; the legacy code multiplies by
// a live `scale`, but our renderer applies zoom via a parent transform, so here
// scale === 1):
//
//  Shadow  (wrapper `filter`): drop-shadow(dx dy 10px rgba(color, opacity))
//          dx = cos(angle°)*distance, dy = sin(angle°)*distance, blur fixed 10px.
//  Blur    (wrapper `filter`): blur(blur_size / 2 px).
//  Border  non-text (`filter`): 8 drop-shadows in 8 directions, offset
//          border_size/2, each with blur radius border_size/6, color border_color.
//  Border  text (`text-shadow`): an outline built from ceil(2π·r) shadows evenly
//          spaced around a circle of radius r = border_size (blur 0).
//
// Colors: shadow_color / border_color are legacy signed ints -> hex via
// signedIntToHex; shadow_opacity is 0..1.

import { signedIntToHex } from "@youzign/designstring";
import type { CommonItemFields } from "@youzign/designstring";

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Trim trailing zeros so `6` not `6px`→ keeps CSS tidy; keeps numeric only. */
const px = (n: number) => `${Math.round(n * 1000) / 1000}px`;

/**
 * The CSS `filter` string for an item's blur + shadow + (non-text) border.
 * Returns undefined when no filter effect is active.
 */
export function effectFilter(
  item: Partial<CommonItemFields> & { type?: string }
): string | undefined {
  const parts: string[] = [];
  const isText = item.type === "text" || item.type === "text-curved";

  // Border for non-text items: 8-direction drop-shadow outline.
  if (item.isBorder && !isText && (item.borderSize ?? 0) > 0) {
    const size = item.borderSize as number;
    const off = size / 2;
    const blur = size / 6;
    const c = signedIntToHex(item.borderColor ?? 0);
    for (const [dx, dy] of [
      [off, 0],
      [-off, 0],
      [0, off],
      [0, -off],
      [off, off],
      [off, -off],
      [-off, off],
      [-off, -off],
    ] as const) {
      parts.push(`drop-shadow(${px(dx)} ${px(dy)} ${px(blur)} ${c})`);
    }
  }

  // Blur.
  if (item.isBlur && (item.blurSize ?? 0) > 0) {
    parts.push(`blur(${px((item.blurSize as number) / 2)})`);
  }

  // Drop shadow.
  if (item.isShadow) {
    const rad = ((item.shadowAngle ?? 0) * Math.PI) / 180;
    const dist = item.shadowDistance ?? 0;
    const dx = Math.cos(rad) * dist;
    const dy = Math.sin(rad) * dist;
    const color = hexToRgba(signedIntToHex(item.shadowColor ?? 0), item.shadowOpacity ?? 1);
    parts.push(`drop-shadow(${px(dx)} ${px(dy)} 10px ${color})`);
  }

  // Invert (legacy Main.ts: `invert(<invertIntensity>%)`).
  if (item.isInvert) {
    parts.push(`invert(${item.invertIntensity ?? 100}%)`);
  }

  return parts.length ? parts.join(" ") : undefined;
}

/**
 * The CSS `mix-blend-mode` for an item, or undefined when normal.
 * Legacy: `item.style.mixBlendMode = item.data.blendMode` (Main.ts).
 */
export function blendModeCss(
  item: Partial<CommonItemFields>
): string | undefined {
  const m = item.blendMode;
  return m && m !== "normal" ? m : undefined;
}

/**
 * The CSS `borderRadius` for an image, or undefined when all corners are 0.
 * Legacy (Main.ts) sets each corner from inputCorner{TopLeft,…} * scale.
 * Order: top-left top-right bottom-right bottom-left.
 */
export function cornerRadiusCss(item: {
  inputCornerTopLeft?: number;
  inputCornerTopRight?: number;
  inputCornerBottomLeft?: number;
  inputCornerBottomRight?: number;
}): string | undefined {
  const tl = Math.max(0, item.inputCornerTopLeft ?? 0);
  const tr = Math.max(0, item.inputCornerTopRight ?? 0);
  const bl = Math.max(0, item.inputCornerBottomLeft ?? 0);
  const br = Math.max(0, item.inputCornerBottomRight ?? 0);
  if (!tl && !tr && !bl && !br) return undefined;
  return `${px(tl)} ${px(tr)} ${px(br)} ${px(bl)}`;
}

/**
 * The CSS `text-shadow` string used to draw a text item's border as an outline.
 * Returns undefined when no text border is active.
 */
export function textBorderShadow(
  item: Partial<CommonItemFields>
): string | undefined {
  if (!item.isBorder || (item.borderSize ?? 0) <= 0) return undefined;
  const r = item.borderSize as number;
  const color = signedIntToHex(item.borderColor ?? 0);
  const n = Math.ceil(2 * Math.PI * r);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n;
    parts.push(`${px(r * Math.cos(theta))} ${px(r * Math.sin(theta))} 0 ${color}`);
  }
  return parts.join(", ");
}
