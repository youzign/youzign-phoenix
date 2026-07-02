// Pure selection-set operations used by the editor store. Selection is an
// ordered array of item uids (no duplicates). These helpers are intentionally
// free of any store/React coupling so they can be unit-tested directly.

/** Toggle a uid in/out of the selection (shift-click semantics). */
export function toggleUid(uids: number[], uid: number): number[] {
  return uids.includes(uid) ? uids.filter((u) => u !== uid) : [...uids, uid];
}

/** Add a uid to the selection if not already present. */
export function addUid(uids: number[], uid: number): number[] {
  return uids.includes(uid) ? uids : [...uids, uid];
}

/** Remove a uid from the selection. */
export function removeUid(uids: number[], uid: number): number[] {
  return uids.filter((u) => u !== uid);
}

/** Normalize an arbitrary uid list: dedupe, drop nullish, preserve order. */
export function normalizeSelection(uids: (number | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const u of uids) {
    if (typeof u === "number" && !out.includes(u)) out.push(u);
  }
  return out;
}

/**
 * Compute new positions for a multi-item move. Given each item's starting
 * position and a canvas-space delta, return the target xpos/ypos per uid.
 * Pure: does not mutate inputs.
 */
export function moveItems(
  starts: { uid: number; xpos: number; ypos: number }[],
  dx: number,
  dy: number
): { uid: number; xpos: number; ypos: number }[] {
  return starts.map((s) => ({ uid: s.uid, xpos: s.xpos + dx, ypos: s.ypos + dy }));
}

/** Cheap set-equality for two selection arrays (order-insensitive). */
export function sameSelection(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((u) => sa.has(u));
}
