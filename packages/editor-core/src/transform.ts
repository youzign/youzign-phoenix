// Pure resize math for the editor overlay handles.
//
// A selection box is center-based + rotation-aware (SelBox). Resizing pins the
// edge/corner OPPOSITE the dragged handle and moves the box center so the pinned
// point stays put in canvas space — exactly matching the geometry the editor
// overlay draws. Extracted here so the (fiddly) math is unit-testable.

import type { SelBox } from "./geometry.js";

export type Corner = "nw" | "ne" | "se" | "sw";
export type Edge = "n" | "s" | "e" | "w";
export type Handle = Corner | Edge;

/** Local-space sign of a handle relative to the box center. Edges have a 0. */
export const HANDLE_SIGN: Record<Handle, [number, number]> = {
  nw: [-1, -1],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1],
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
};

const MIN_SIZE = 8;

function rot(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

export interface ResizePatch {
  width: number;
  height: number;
  xpos: number;
  ypos: number;
}

/**
 * Resize by dragging a CORNER handle to canvas-space point `p`.
 * Pins the opposite corner. `lockAspect` keeps the start aspect ratio.
 */
export function resizeCorner(
  b: SelBox,
  corner: Corner,
  p: { x: number; y: number },
  lockAspect: boolean
): ResizePatch {
  const [sx, sy] = HANDLE_SIGN[corner];
  const oppLocal = { x: (-sx * b.w) / 2, y: (-sy * b.h) / 2 };
  const oppWorld = rot(oppLocal.x, oppLocal.y, b.rotation);
  const fixed = { x: b.cx + oppWorld.x, y: b.cy + oppWorld.y };
  const newCenter = { x: (p.x + fixed.x) / 2, y: (p.y + fixed.y) / 2 };
  const local = rot(p.x - newCenter.x, p.y - newCenter.y, -b.rotation);
  let nw = Math.max(MIN_SIZE, Math.abs(local.x) * 2);
  let nh = Math.max(MIN_SIZE, Math.abs(local.y) * 2);
  if (lockAspect) {
    const ratio = b.w / b.h || 1;
    if (nw / nh > ratio) nh = nw / ratio;
    else nw = nh * ratio;
  }
  const newOppOff = rot((-sx * nw) / 2, (-sy * nh) / 2, b.rotation);
  return {
    width: nw,
    height: nh,
    xpos: fixed.x - newOppOff.x,
    ypos: fixed.y - newOppOff.y,
  };
}

/**
 * Resize by dragging an EDGE handle (single-axis stretch): pins the opposite
 * edge, changes only the dragged axis, keeps the perpendicular dimension.
 */
export function resizeEdge(
  b: SelBox,
  edge: Edge,
  p: { x: number; y: number }
): ResizePatch {
  const [sx, sy] = HANDLE_SIGN[edge];
  // Pointer in box-local space (relative to current center, un-rotated).
  const localP = rot(p.x - b.cx, p.y - b.cy, -b.rotation);
  let nw = b.w;
  let nh = b.h;
  let localCx = 0;
  let localCy = 0;
  if (sx !== 0) {
    const oppX = (-sx * b.w) / 2; // fixed opposite edge (local x)
    nw = Math.max(MIN_SIZE, (localP.x - oppX) * sx);
    localCx = oppX + (sx * nw) / 2;
  }
  if (sy !== 0) {
    const oppY = (-sy * b.h) / 2;
    nh = Math.max(MIN_SIZE, (localP.y - oppY) * sy);
    localCy = oppY + (sy * nh) / 2;
  }
  const world = rot(localCx, localCy, b.rotation);
  return {
    width: nw,
    height: nh,
    xpos: b.cx + world.x,
    ypos: b.cy + world.y,
  };
}

/**
 * Crop rect (canvas space, axis-aligned) for dragging an image EDGE handle
 * INWARD, Canva-style. Starts from the full image box; the dragged edge moves
 * to `p` (clamped so it can only shrink and stays a positive rect). The other
 * three edges stay put.
 */
export function edgeCropRect(
  box: { xpos: number; ypos: number; width: number; height: number },
  edge: Edge,
  p: { x: number; y: number },
  minSize = MIN_SIZE
): { x: number; y: number; w: number; h: number } {
  let left = box.xpos - box.width / 2;
  let top = box.ypos - box.height / 2;
  let right = box.xpos + box.width / 2;
  let bottom = box.ypos + box.height / 2;
  if (edge === "w") left = Math.min(right - minSize, Math.max(left, p.x));
  if (edge === "e") right = Math.max(left + minSize, Math.min(right, p.x));
  if (edge === "n") top = Math.min(bottom - minSize, Math.max(top, p.y));
  if (edge === "s") bottom = Math.max(top + minSize, Math.min(bottom, p.y));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
