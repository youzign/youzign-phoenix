// Geometry ports of the legacy Utils.ts matrix builders (scale = 1).

import type { CommonItemFields, TextFields } from "@youzign/designstring";

export interface CssMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function matrixToCss(m: CssMatrix): string {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`;
}

/**
 * IMAGE / CLIPART: xpos/ypos is the CENTER; top-left = (xpos - w/2, ypos - h/2).
 * Render at that top-left, transform-origin center, rotate(rotation deg).
 */
export function boxTopLeft(item: Pick<CommonItemFields, "xpos" | "ypos" | "width" | "height">) {
  return {
    left: item.xpos - item.width / 2,
    top: item.ypos - item.height / 2,
  };
}

/**
 * TEXT: replicate createTextMatrix. Returns { left, top, matrix } where the
 * outer div is positioned at (left, top) sized textAreaWidth x textAreaHeight
 * with the given matrix applied at transform-origin 0 0.
 */
export function textPlacement(
  item: CommonItemFields & TextFields
): { left: number; top: number; matrix: CssMatrix } {
  const radians = (item.rotation * Math.PI) / 180;
  const sx = item.textAreaWidth ? item.mcWidth / item.textAreaWidth : 1;
  const sy = item.textAreaHeight ? item.mcHeight / item.textAreaHeight : 1;

  const cos = Math.cos(radians) * sx;
  const sin = Math.sin(radians) * sy;

  const left = item.xpos + item.textAreaxpos * sx;
  const top = item.ypos + item.textAreaypos * sy;

  // createTextMatrix: since centerX==originalX, the rotation term collapses and
  // translate == (left, top). Matrix = (cos*sx, sin*sy, -sin*sy, cos*sx, left, top).
  return {
    left,
    top,
    matrix: { a: cos, b: sin, c: -sin, d: cos, e: left, f: top },
  };
}

/**
 * CURVED TEXT arc geometry — a faithful reconstruction of the legacy
 * `text-curved` layout from its stored attributes (`radius`, `start_angle`,
 * `end_angle`, `top_direction`). The 2017 Flash editor baked the arc in the
 * SWF (no TS reference survived), so this reproduces the *semantics* of those
 * attributes rather than pixel-for-pixel Flash internals:
 *
 *  - `radius`  — circle radius in design px. 0 (or <=0) means "not curved"
 *                → callers should fall back to straight text.
 *  - span      — `end_angle − start_angle` degrees; how much of the circle the
 *                text occupies. The text is centred on the arc's apex.
 *  - `top_direction` true  → text arcs OVER the top (apex up, "rainbow"), the
 *                             circle centre sits BELOW the text.
 *                    false → text arcs UNDER the bottom ("valley"), the circle
 *                             centre sits ABOVE the text.
 *
 * Coordinate frame: the circle centre is at (0,0); screen axes (x right, y
 * down). The apex (the point the text is centred on) is the local origin the
 * renderer aligns to the item's (xpos,ypos). Returns an SVG `<path>` `d`, the
 * apex offset (apexX, apexY relative to centre) and a bounding box so the
 * renderer can size/position the SVG and the editor can draw a selection box.
 */
export interface CurvedArc {
  path: string;
  /** circle centre position within the returned viewBox */
  cx: number;
  cy: number;
  /** viewBox / svg pixel size */
  width: number;
  height: number;
  /** apex (text-centre) position within the returned viewBox */
  apexX: number;
  apexY: number;
  /** true when the geometry is a valid curve (radius>0 and span>0) */
  curved: boolean;
}

const DEG = Math.PI / 180;

export function curvedTextArc(
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
  topDirection: boolean,
  pad = 4
): CurvedArc {
  const spanDeg = Math.abs(endAngleDeg - startAngleDeg);
  if (!(radius > 0) || spanDeg <= 0) {
    return { path: "", cx: 0, cy: 0, width: 0, height: 0, apexX: 0, apexY: 0, curved: false };
  }
  const half = (spanDeg / 2) * DEG;

  // Point on the circle at "clock angle" θ measured from the apex.
  //  top_direction: apex at top (0,-r); P(θ) = ( r sinθ, -r cosθ ), text drawn
  //    left→right by sweeping clockwise (SVG sweep-flag 1).
  //  bottom       : apex at bottom (0,+r); P(θ) = ( r sinθ,  r cosθ ), swept
  //    counter-clockwise (sweep-flag 0) so glyphs stay upright.
  const pt = (theta: number): [number, number] =>
    topDirection
      ? [radius * Math.sin(theta), -radius * Math.cos(theta)]
      : [radius * Math.sin(theta), radius * Math.cos(theta)];

  const [x0, y0] = pt(-half); // left end
  const [x1, y1] = pt(half); // right end
  const [ax, ay] = pt(0); // apex

  // Bounding box of the swept arc (centre-relative). The extreme x is at
  // θ=±90° if the span reaches there, else at the endpoints; extreme y is the
  // apex vs the endpoints.
  const xs = [x0, x1, ax];
  const ys = [y0, y1, ay];
  if (half >= Math.PI / 2) {
    xs.push(radius, -radius); // arc passes the horizontal extremes
  }
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;

  const cx = -minX;
  const cy = -minY;
  const width = maxX - minX;
  const height = maxY - minY;

  const largeArc = spanDeg > 180 ? 1 : 0;
  const sweep = topDirection ? 1 : 0;
  const path = `M ${(cx + x0).toFixed(3)} ${(cy + y0).toFixed(3)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${(cx + x1).toFixed(3)} ${(cy + y1).toFixed(3)}`;

  return { path, cx, cy, width, height, apexX: cx + ax, apexY: cy + ay, curved: true };
}

/** flip transform fragment for hFlip/vFlip */
export function flipTransform(hFlip: boolean, vFlip: boolean): string {
  const parts: string[] = [];
  if (hFlip) parts.push("scaleX(-1)");
  if (vFlip) parts.push("scaleY(-1)");
  return parts.join(" ");
}
