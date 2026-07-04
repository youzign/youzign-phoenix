// Pure resize math for the editor overlay handles.
//
// A selection box is center-based + rotation-aware (SelBox). Resizing pins the
// edge/corner OPPOSITE the dragged handle and moves the box center so the pinned
// point stays put in canvas space — exactly matching the geometry the editor
// overlay draws. Extracted here so the (fiddly) math is unit-testable.

import type { SelBox } from "./geometry.js";
import type { ItemPatch } from "./mutations.js";
import type { TextItem } from "@youzign/designstring";

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
const MIN_TEXT_FONT_SIZE = 4;

function rot(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

function localDelta(
  start: { x: number; y: number },
  p: { x: number; y: number },
  rotation: number
) {
  return rot(p.x - start.x, p.y - start.y, -rotation);
}

function textMinWidth(item: Pick<TextItem, "size">): number {
  return Math.max(4, item.size * 0.6);
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

export interface TextTransformPatch extends ItemPatch {
  wrapping?: boolean;
  scaleUsed?: boolean;
  textAreaWidth?: number;
  textAreaHeight?: number;
  mcWidth?: number;
  mcHeight?: number;
  textAreaxpos?: number;
  textAreaypos?: number;
}

/**
 * Canva-style text corner scale: font size and wrap width scale by the same
 * factor, and the opposite measured-selection corner remains pinned.
 */
export function resizeTextCorner(
  item: TextItem,
  b: SelBox,
  corner: Corner,
  p: { x: number; y: number }
): TextTransformPatch {
  const resized = resizeCorner(b, corner, p, true);
  const rawScale = b.w > 0 ? resized.width / b.w : b.h > 0 ? resized.height / b.h : 1;
  const minScale = Math.max(
    MIN_TEXT_FONT_SIZE / Math.max(item.size, 0.0001),
    textMinWidth(item) / Math.max(item.textAreaWidth, 0.0001)
  );
  const scale = Math.max(minScale, rawScale);
  const [sx, sy] = HANDLE_SIGN[corner];
  const fixedLocal = { x: (-sx * b.w) / 2, y: (-sy * b.h) / 2 };
  const fixedWorld = rot(fixedLocal.x, fixedLocal.y, b.rotation);
  const fixed = { x: b.cx + fixedWorld.x, y: b.cy + fixedWorld.y };
  const originFromFixed = rot(item.xpos - fixed.x, item.ypos - fixed.y, -b.rotation);
  const scaledOrigin = rot(originFromFixed.x * scale, originFromFixed.y * scale, b.rotation);

  return {
    xpos: fixed.x + scaledOrigin.x,
    ypos: fixed.y + scaledOrigin.y,
    size: item.size * scale,
    textAreaWidth: item.textAreaWidth * scale,
    mcWidth: item.mcWidth * scale,
    textAreaxpos: item.textAreaxpos * scale,
    textAreaypos: item.textAreaypos * scale,
    wrapping: item.wrapping,
    scaleUsed: true,
  };
}

/**
 * Canva-style text side pills: only left/right handles exist; they change wrap
 * width along the item's local x-axis. The opposite edge stays anchored.
 */
export function resizeTextSide(
  item: TextItem,
  edge: Extract<Edge, "e" | "w">,
  start: { x: number; y: number },
  p: { x: number; y: number }
): TextTransformPatch {
  const d = localDelta(start, p, item.rotation);
  const currentWidth = item.mcWidth || item.textAreaWidth;
  const sx = item.textAreaWidth ? currentWidth / item.textAreaWidth : 1;
  const signedDelta = edge === "e" ? d.x : -d.x;
  if (Math.abs(signedDelta) < 0.0001) return {};
  const newMcWidth = Math.max(textMinWidth(item), currentWidth + signedDelta);
  const newTextAreaWidth = newMcWidth / (sx || 1);
  const centerDelta = edge === "e"
    ? (newMcWidth - currentWidth) / 2
    : (currentWidth - newMcWidth) / 2;
  const world = rot(centerDelta, 0, item.rotation);

  return {
    xpos: item.xpos + world.x,
    ypos: item.ypos + world.y,
    textAreaWidth: newTextAreaWidth,
    mcWidth: newMcWidth,
    textAreaxpos: -newTextAreaWidth / 2,
    wrapping: true,
    scaleUsed: true,
  };
}

/**
 * Crop rect (canvas space, axis-aligned) for dragging an image EDGE handle
 * INWARD, Canva-style. Starts from the full image box; the dragged edge moves
 * to `p` (clamped so it can only shrink and stays a positive rect). The other
 * three edges stay put.
 */
export interface RotationSnap {
  /** angle to apply (degrees, normalised to [0,360)) */
  angle: number;
  /** true when the angle was snapped to a guide */
  snapped: boolean;
  /** true when snapped to a cardinal (0/90/180/270) — draw a stronger tick */
  strong: boolean;
}

/** Normalise any angle to the [0, 360) range. */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Rotation snapping for the top rotate handle.
 *  - default: auto-snap to the nearest 45° guide within `threshold` degrees
 *    (cardinals 0/90/180/270 flagged `strong`);
 *  - `fine` (Ctrl/Cmd held): no snapping, raw angle passes through;
 *  - `step` (Shift held): quantise to 15° increments.
 * Returns a normalised angle in [0, 360).
 */
export function snapRotation(
  angle: number,
  opts: { fine?: boolean; step?: boolean; threshold?: number } = {}
): RotationSnap {
  const norm = normalizeAngle(angle);
  if (opts.fine) return { angle: norm, snapped: false, strong: false };
  if (opts.step) {
    const s = normalizeAngle(Math.round(norm / 15) * 15);
    return { angle: s, snapped: true, strong: s % 90 === 0 };
  }
  const threshold = opts.threshold ?? 4;
  const nearest = Math.round(norm / 45) * 45; // 0..360
  let d = Math.abs(norm - nearest);
  if (d > 180) d = 360 - d;
  if (d <= threshold) {
    const n = normalizeAngle(nearest);
    return { angle: n, snapped: true, strong: n % 90 === 0 };
  }
  return { angle: norm, snapped: false, strong: false };
}

export function edgeCropRect(
  box: { xpos: number; ypos: number; width: number; height: number },
  edge: Edge,
  p: { x: number; y: number },
  minSize = MIN_SIZE,
  bounds?: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  let left = box.xpos - box.width / 2;
  let top = box.ypos - box.height / 2;
  let right = box.xpos + box.width / 2;
  let bottom = box.ypos + box.height / 2;
  const limit = bounds ?? { x: left, y: top, w: right - left, h: bottom - top };
  const minLeft = limit.x;
  const minTop = limit.y;
  const maxRight = limit.x + limit.w;
  const maxBottom = limit.y + limit.h;
  if (edge === "w") left = Math.min(right - minSize, Math.max(minLeft, p.x));
  if (edge === "e") right = Math.max(left + minSize, Math.min(maxRight, p.x));
  if (edge === "n") top = Math.min(bottom - minSize, Math.max(minTop, p.y));
  if (edge === "s") bottom = Math.max(top + minSize, Math.min(maxBottom, p.y));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
