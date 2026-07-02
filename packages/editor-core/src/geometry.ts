// Selection-box geometry: a center-based, rotated box per item, used by the
// editor overlay for handles and hit-testing. Coordinates are in canvas space.

import type { Item } from "@youzign/designstring";

export interface SelBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

/** Axis-aligned rectangle in canvas space. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rotate(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** The four corners of a (possibly rotated) selection box, in canvas space. */
export function boxCorners(b: SelBox): { x: number; y: number }[] {
  const hw = b.w / 2;
  const hh = b.h / 2;
  return (
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as [number, number][]
  ).map(([lx, ly]) => {
    const r = rotate(lx, ly, b.rotation);
    return { x: b.cx + r.x, y: b.cy + r.y };
  });
}

/** Axis-aligned bounding rect of a rotated box. */
export function boxAABB(b: SelBox): Rect {
  const pts = boxCorners(b);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** Combined axis-aligned bounding box enclosing every input box (rotation 0). */
export function combinedBox(boxes: SelBox[]): SelBox | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    for (const p of boxCorners(b)) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX,
    h: maxY - minY,
    rotation: 0,
  };
}

/** Do two axis-aligned rects overlap (share any area)? */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/** Does a (rotated) box intersect a marquee rect? Tests via the box AABB. */
export function boxIntersectsRect(box: SelBox, rect: Rect): boolean {
  return rectsIntersect(boxAABB(box), rect);
}

/**
 * Map a group child's local selection box (group-center-relative) into canvas
 * space, applying the group's translate + scale + rotation. Matches the
 * renderer's GroupItemView wrapper transform.
 */
export function childBoxInCanvas(
  group: Item & Record<string, any>,
  childBox: SelBox
): SelBox {
  const sx = group.scaleX ?? 1;
  const sy = group.scaleY ?? 1;
  const scaled = { x: childBox.cx * sx, y: childBox.cy * sy };
  const r = rotate(scaled.x, scaled.y, group.rotation ?? 0);
  return {
    cx: group.xpos + r.x,
    cy: group.ypos + r.y,
    w: childBox.w * sx,
    h: childBox.h * sy,
    rotation: (group.rotation ?? 0) + childBox.rotation,
  };
}

export function itemBox(item: Item & Record<string, any>): SelBox {
  switch (item.type) {
    case "image":
    case "clipart":
      return { cx: item.xpos, cy: item.ypos, w: item.width, h: item.height, rotation: item.rotation };
    case "group":
      return {
        cx: item.xpos,
        cy: item.ypos,
        w: item.width || 140,
        h: item.height || 140,
        rotation: item.rotation,
      };
    case "text":
    case "text-curved": {
      const sx = item.textAreaWidth ? item.mcWidth / item.textAreaWidth : 1;
      const sy = item.textAreaHeight ? item.mcHeight / item.textAreaHeight : 1;
      const left = item.xpos + item.textAreaxpos * sx;
      const top = item.ypos + item.textAreaypos * sy;
      const w = item.mcWidth || item.textAreaWidth * sx;
      const h = item.mcHeight || item.textAreaHeight * sy;
      return { cx: left + w / 2, cy: top + h / 2, w, h, rotation: item.rotation };
    }
    default:
      return { cx: 0, cy: 0, w: 0, h: 0, rotation: 0 };
  }
}
