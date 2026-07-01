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

/** flip transform fragment for hFlip/vFlip */
export function flipTransform(hFlip: boolean, vFlip: boolean): string {
  const parts: string[] = [];
  if (hFlip) parts.push("scaleX(-1)");
  if (vFlip) parts.push("scaleY(-1)");
  return parts.join(" ");
}
