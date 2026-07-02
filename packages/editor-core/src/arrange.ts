// Pure arrangement ops: centre-on-canvas and one-step z-order.
//
// These only ever touch the item(s) being moved (z-step swaps the `index`
// attribute values of exactly two neighbours), so untouched items stay
// byte-stable on serialize.

import type { Design, Item } from "@youzign/designstring";
import { patchItem } from "./mutations.js";

export type CenterAxis = "h" | "v";

/** Patch that centres a top-level item on the canvas along one axis. */
export function centerPatch(design: Design, axis: CenterAxis): { xpos?: number; ypos?: number } {
  return axis === "h"
    ? { xpos: design.canvasWidth / 2 }
    : { ypos: design.canvasHeight / 2 };
}

function idx(it: Item): number {
  return (it as any).index ?? 0;
}

/** Swap the `index` attribute values of two items (keeps rawAttrs in sync). */
function swapIndex(a: Item, b: Item): void {
  const ai = idx(a);
  const bi = idx(b);
  patchItem(a as any, { index: bi });
  patchItem(b as any, { index: ai });
}

function sortByIndex(design: Design): void {
  design.items.sort((a, b) => idx(a) - idx(b));
}

/**
 * Move the given target items one step towards the front (higher z). Each
 * selected item swaps with the nearest un-selected neighbour above it, so a
 * contiguous multi-selection travels as a block. Order-preserving and idempotent
 * at the top of the stack.
 */
export function stepForward(design: Design, targets: Item[]): void {
  const set = new Set(targets);
  const arr = [...design.items].sort((a, b) => idx(a) - idx(b));
  for (let i = arr.length - 2; i >= 0; i--) {
    if (set.has(arr[i]) && !set.has(arr[i + 1])) {
      swapIndex(arr[i], arr[i + 1]);
      const tmp = arr[i];
      arr[i] = arr[i + 1];
      arr[i + 1] = tmp;
    }
  }
  sortByIndex(design);
}

/**
 * Reassign z-order so the top-level items appear in `ordered` (back-to-front,
 * i.e. ascending final z). Preserves the exact multiset of existing `index`
 * values — only items whose position changed get a new index, so unmoved items
 * stay byte-identical on serialize. Used by the Layers panel drag-reorder.
 */
export function applyOrder(design: Design, ordered: Item[]): void {
  // Reuse only the index values of the items being reordered, so unrelated
  // nodes (e.g. filter overlays with no index) are left completely untouched.
  const values = ordered.map(idx).sort((a, b) => a - b);
  ordered.forEach((it, i) => patchItem(it as any, { index: values[i] }));
  sortByIndex(design);
}

/** Move the given target items one step towards the back (lower z). */
export function stepBackward(design: Design, targets: Item[]): void {
  const set = new Set(targets);
  const arr = [...design.items].sort((a, b) => idx(a) - idx(b));
  for (let i = 1; i < arr.length; i++) {
    if (set.has(arr[i]) && !set.has(arr[i - 1])) {
      swapIndex(arr[i], arr[i - 1]);
      const tmp = arr[i];
      arr[i] = arr[i - 1];
      arr[i - 1] = tmp;
    }
  }
  sortByIndex(design);
}
