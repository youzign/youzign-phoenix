// Smart snap guides + grid — Canva-style alignment while dragging.
//
// Pure math only (the CanvasStage feeds it screen->canvas geometry and renders
// the returned guide lines). Everything here works in CANVAS units.
//
// Candidate lines come from a moving box's left/center/right (vertical) and
// top/center/bottom (horizontal) edges, matched against TARGET lines drawn from
// the canvas (edges + center), other items' AABBs, and (optionally) a grid.
//
// Hysteresis: a snap ENGAGES within `threshold` but only RELEASES once the
// candidate drifts past `release` (> threshold), so it doesn't feel sticky.

import { boxAABB, type SelBox } from "./geometry.js";

export type Orient = "v" | "h";

export interface SnapLines {
  v: number[]; // vertical guide positions (canvas x)
  h: number[]; // horizontal guide positions (canvas y)
}

/** The three snap candidates of a box on each axis (from its AABB). */
export function boxCandidates(box: SelBox): SnapLines {
  const r = boxAABB(box);
  return {
    v: [r.x, r.x + r.w / 2, r.x + r.w],
    h: [r.y, r.y + r.h / 2, r.y + r.h],
  };
}

/** Target lines from the canvas frame: edges + center on both axes. */
export function canvasTargets(canvasW: number, canvasH: number): SnapLines {
  return {
    v: [0, canvasW / 2, canvasW],
    h: [0, canvasH / 2, canvasH],
  };
}

/** Target lines from a set of (other) item boxes: each box's edges + centers. */
export function itemTargets(boxes: SelBox[]): SnapLines {
  const v: number[] = [];
  const h: number[] = [];
  for (const b of boxes) {
    const c = boxCandidates(b);
    v.push(...c.v);
    h.push(...c.h);
  }
  return { v, h };
}

/** Grid lines across the canvas at `step` canvas units. */
export function gridTargets(canvasW: number, canvasH: number, step: number): SnapLines {
  const v: number[] = [];
  const h: number[] = [];
  if (step > 0) {
    for (let x = 0; x <= canvasW + 0.5; x += step) v.push(x);
    for (let y = 0; y <= canvasH + 0.5; y += step) h.push(y);
  }
  return { v, h };
}

/** Merge several target line sets into one. */
export function mergeTargets(...sets: SnapLines[]): SnapLines {
  return {
    v: sets.flatMap((s) => s.v),
    h: sets.flatMap((s) => s.h),
  };
}

export interface AxisSnap {
  /** Amount to shift the box on this axis so a candidate lands on a target. */
  delta: number;
  /** The engaged target position (for drawing the guide), or null. */
  line: number | null;
}

export interface AxisOptions {
  threshold: number;
  /** Release distance (> threshold). Defaults to threshold * 1.8. */
  release?: number;
  /** Previously engaged target position (for hysteresis), or null. */
  engaged?: number | null;
}

/**
 * Snap one axis. `candidates` are the moving box's line positions on this axis;
 * `targets` are the fixed lines to snap to. Returns the shift `delta` and the
 * engaged target `line` (null = no snap).
 */
export function snapAxis(
  candidates: number[],
  targets: number[],
  opts: AxisOptions
): AxisSnap {
  const threshold = opts.threshold;
  const release = opts.release ?? threshold * 1.8;
  const engaged = opts.engaged ?? null;

  // Hysteresis: if we were engaged to a target, keep it until we drift past
  // `release` from every candidate.
  if (engaged !== null) {
    let best = Infinity;
    let bestDelta = 0;
    for (const c of candidates) {
      const d = engaged - c;
      if (Math.abs(d) < Math.abs(best)) {
        best = Math.abs(d);
        bestDelta = d;
      }
    }
    if (best <= release) return { delta: bestDelta, line: engaged };
  }

  // Fresh engage: nearest target within `threshold` across all candidates.
  let bestDist = threshold;
  let result: AxisSnap = { delta: 0, line: null };
  for (const c of candidates) {
    for (const t of targets) {
      const d = t - c;
      if (Math.abs(d) <= bestDist) {
        bestDist = Math.abs(d);
        result = { delta: d, line: t };
      }
    }
  }
  return result;
}

export interface SnapState {
  v: number | null;
  h: number | null;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapLines; // active guide lines to render
  engaged: SnapState; // pass back in next frame for hysteresis
}

export interface SnapOptions {
  threshold: number;
  release?: number;
  engaged?: SnapState;
}

/**
 * Resolve a full 2-axis snap for a moving box against target lines. Returns the
 * corrective (dx, dy) to add to the drag, the guide lines to draw, and the new
 * engaged state to thread through the next frame.
 */
export function resolveSnap(
  movingBox: SelBox,
  targets: SnapLines,
  opts: SnapOptions
): SnapResult {
  const cand = boxCandidates(movingBox);
  const prev = opts.engaged ?? { v: null, h: null };
  const vx = snapAxis(cand.v, targets.v, {
    threshold: opts.threshold,
    release: opts.release,
    engaged: prev.v,
  });
  const hy = snapAxis(cand.h, targets.h, {
    threshold: opts.threshold,
    release: opts.release,
    engaged: prev.h,
  });
  return {
    dx: vx.delta,
    dy: hy.delta,
    guides: {
      v: vx.line !== null ? [vx.line] : [],
      h: hy.line !== null ? [hy.line] : [],
    },
    engaged: { v: vx.line, h: hy.line },
  };
}
