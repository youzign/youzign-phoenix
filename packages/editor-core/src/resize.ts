// Canvas resize — the "smart resize" core (gap #1).
//
// Two modes, both pure mutations that keep rawAttrs in sync with the typed view
// so serialize() round-trips validly:
//
//   scaleElements=false — legacy behavior: only the canvas dimensions change;
//     every item keeps its absolute position/size (content may now overflow or
//     sit off-centre, exactly as the 2016 editor did).
//
//   scaleElements=true  — Canva-style smart resize: a single uniform scale
//     factor s = min(newW/oldW, newH/oldH) is applied to every item's position
//     AND size (never cropping, since we take the min), then the whole content
//     block is re-centred on the leftover axis so the composition stays visually
//     centred. Text font size and px-based effects (shadow distance, border
//     size, blur, curved-text radius) scale by s too; groups scale via their
//     scaleX/scaleY semantics (children are group-local, so they ride along).
//
// Rounding matches the other mutations (2 decimals). Only touched when the user
// actually resizes, so untouched designs stay byte-stable.

import type { Design, Item, RawCarrier } from "@youzign/designstring";
import { setRaw } from "./mutations.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Set a numeric typed field + its raw attribute (rounded to 2 decimals). */
function setNum(
  item: RawCarrier & Record<string, any>,
  field: string,
  rawKey: string,
  value: number
): void {
  const v = round2(value);
  item[field] = v;
  setRaw(item, rawKey, String(v));
}

/** Change only the canvas dimensions (+ optional dpi), syncing rawAttrs. */
export function setCanvasSize(
  design: Design,
  newW: number,
  newH: number,
  dpi?: number
): void {
  design.canvasWidth = newW;
  setRaw(design, "canvas_width", String(newW));
  design.canvasHeight = newH;
  setRaw(design, "canvas_height", String(newH));
  if (dpi !== undefined) {
    design.dpi = dpi;
    setRaw(design, "dpi", String(dpi));
  }
}

/** Fields that carry px-based effect lengths, scaled with the item. */
const PX_EFFECT_FIELDS: [field: string, rawKey: string][] = [
  ["shadowDistance", "shadow_distance"],
  ["borderSize", "border_size"],
  ["blurSize", "blur_size"],
];

/** Scale a single item (position + size + type-specific lengths) by `s`, then
 *  translate its centre by (offX, offY) for content re-centring. */
function scaleItem(item: Item, s: number, offX: number, offY: number): void {
  if (item.type === "filter") return; // no geometry
  const it = item as RawCarrier & Record<string, any> & { type: string };

  // position (centre) — scale about canvas origin, then re-centre offset.
  if (typeof it.xpos === "number") setNum(it, "xpos", "xpos", it.xpos * s + offX);
  if (typeof it.ypos === "number") setNum(it, "ypos", "ypos", it.ypos * s + offY);

  // box size
  if (typeof it.width === "number") setNum(it, "width", "width", it.width * s);
  if (typeof it.height === "number") setNum(it, "height", "height", it.height * s);

  // px-based effects (shared by every geometric item type)
  for (const [field, rawKey] of PX_EFFECT_FIELDS) {
    if (typeof it[field] === "number") setNum(it, field, rawKey, it[field] * s);
  }

  if (item.type === "text" || item.type === "text-curved") {
    // font size + the text-area metrics that drive placement/wrapping. The
    // mcWidth/textAreaWidth ratio is preserved (both scale by s), so the render
    // matrix is unchanged apart from the uniform scale.
    setNum(it, "size", "size", it.size * s);
    for (const f of [
      "textAreaWidth",
      "textAreaHeight",
      "mcWidth",
      "mcHeight",
      "textAreaxpos",
      "textAreaypos",
    ]) {
      if (typeof it[f] === "number") setNum(it, f, f, it[f] * s);
    }
  }

  if (item.type === "text-curved") {
    // radius is a px length; angles are angular (size-independent).
    if (typeof it.radius === "number") setNum(it, "radius", "radius", it.radius * s);
  }

  if (item.type === "group") {
    // Children are group-local; the group's own scaleX/scaleY carries the
    // uniform scale down to them. Multiply, don't recurse.
    setNum(it, "scaleX", "scaleX", (it.scaleX ?? 1) * s);
    setNum(it, "scaleY", "scaleY", (it.scaleY ?? 1) * s);
  }
}

export interface ResizeOptions {
  /** true = Canva-style proportional scale + re-centre; false = dims only. */
  scaleElements: boolean;
  /** optional target dpi to stamp (e.g. 300 for a print preset). */
  dpi?: number;
}

/**
 * Resize the design canvas to (newW × newH). See module header for semantics.
 * Mutates `design` in place; the caller wraps it in a history snapshot.
 */
export function resizeDesign(
  design: Design,
  newW: number,
  newH: number,
  opts: ResizeOptions
): void {
  const oldW = design.canvasWidth;
  const oldH = design.canvasHeight;

  setCanvasSize(design, newW, newH, opts.dpi);

  if (!opts.scaleElements) return;
  if (!(oldW > 0) || !(oldH > 0)) return; // nothing sensible to scale against

  const s = Math.min(newW / oldW, newH / oldH);
  // Re-centre the scaled content block on whichever axis has slack. The scaled
  // canvas content spans oldW*s × oldH*s; centre it in newW × newH.
  const offX = (newW - oldW * s) / 2;
  const offY = (newH - oldH * s) / 2;

  for (const item of design.items) scaleItem(item, s, offX, offY);
}
