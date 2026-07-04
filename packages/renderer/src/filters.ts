// Faithful port of the legacy editor's canvas-wide "filters" (PanelFilters.ts,
// `updateFilter()`). A design carries at most one <item type="filter"> holding
// `filterid` (1..15) + `opacity` (the legacy `filterAlpha`, 0..1).
//
// Legacy applies a CSS `filter` string to `#canvas` and shows up to two overlay
// layers (`#filterLayer1` / `#filterLayer2`), each a radial vignette texture
// (assets/images/FilterLayer.png) with a `mix-blend-mode` + `opacity`. We render
// the vignette faithfully as a CSS radial-gradient (the source PNG is a smooth
// white-center → black-edge radial vignette).
//
// Opacity math is the legacy `percentToRange(percent, min, max) = (max-min)*percent + min`.
// `setSaturationContrastBrightness(sat, con, bri, custom)` →
//   filter: saturate(range(a,1,sat)) contrast(range(a,1,con)) brightness(range(a,1,bri)) custom

import type { FilterItem } from "@youzign/designstring";

/** Legacy Utils.ts percentToRange. */
function range(percent: number, min: number, max: number): number {
  return (max - min) * percent + min;
}

/** Trim to at most 6 dp so the CSS string stays tidy and deterministic. */
const n = (x: number) => `${Math.round(x * 1e6) / 1e6}`;

export interface FilterLayer {
  blendMode: string;
  opacity: number;
  background?: string;
}

export interface FilterRecipe {
  /** CSS `filter` string applied to the whole canvas (undefined = none). */
  canvasFilter?: string;
  /** Overlay vignette layers, drawn above items (legacy filterLayer1/2). */
  layers: FilterLayer[];
}

function scb(a: number, sat: number, con: number, bri: number, custom = ""): string {
  return (
    `saturate(${n(range(a, 1, sat))}) ` +
    `contrast(${n(range(a, 1, con))}) ` +
    `brightness(${n(range(a, 1, bri))})` +
    (custom ? ` ${custom}` : "")
  );
}

function modernParts(
  a: number,
  parts: Array<["saturate" | "contrast" | "brightness", number] | ["hue-rotate", number] | ["sepia" | "grayscale", number]>
): string {
  return parts
    .map(([fn, value]) => {
      if (fn === "saturate" || fn === "contrast" || fn === "brightness") {
        return `${fn}(${n(range(a, 1, value))})`;
      }
      if (fn === "hue-rotate") return `hue-rotate(${n(range(a, 0, value))}deg)`;
      return `${fn}(${n(range(a, 0, value))})`;
    })
    .join(" ");
}

/**
 * Resolve a legacy filterid + alpha to the canvas filter + overlay layers.
 * Values are the exact recipes from PanelFilters.ts `updateFilter()`.
 */
export function filterRecipe(filterid: number, alpha: number): FilterRecipe {
  const a = alpha;
  switch (filterid) {
    case 1: // original
      return { layers: [] };
    case 2: // grayscale
      return { canvasFilter: `grayscale(${n(a)})`, layers: [] };
    case 3: // sepia
      return { canvasFilter: `sepia(${n(a)})`, layers: [] };
    case 4: // vignette
      return {
        layers: [
          { blendMode: "overlay", opacity: range(a, 0, 0.59) },
          { blendMode: "multiply", opacity: range(a, 0, 0.24) },
        ],
      };
    case 5: // lomo
      return {
        layers: [
          { blendMode: "overlay", opacity: range(a, 0, 1) },
          { blendMode: "multiply", opacity: range(a, 0, 0.28) },
        ],
      };
    case 6: // orton
      return { canvasFilter: scb(a, 1.12, 1.2, 1.27), layers: [] };
    case 7: // polaroid
      return {
        canvasFilter: scb(a, 1 - 0.13, 1, 1),
        layers: [{ blendMode: "overlay", opacity: range(a, 0, 0.58) }],
      };
    case 8: // retro
      return {
        canvasFilter: scb(a, 1 - 0.37, 1.15, 1.21, `sepia(${n(range(a, 0, 0.8))})`),
        layers: [{ blendMode: "overlay", opacity: range(a, 0, 0.7) }],
      };
    case 9: // vintage
      return {
        canvasFilter: scb(a, 1 - 0.41, 1.35, 0.9),
        layers: [{ blendMode: "multiply", opacity: range(a, 0, 0.44) }],
      };
    case 10: // adventure
      return {
        canvasFilter: scb(a, 1.14, 1, 0.85),
        layers: [{ blendMode: "overlay", opacity: range(a, 0, 0.38) }],
      };
    case 11: // ignite
      return { canvasFilter: scb(a, 1.15, 1.016, 1.05), layers: [] };
    case 12: // blonde
      return { canvasFilter: scb(a, 1 - 0.16, 1.01, 1.048), layers: [] };
    case 13: // sense
      return {
        canvasFilter: scb(a, 1 - 0.35, 1.019, 1.016, `hue-rotate(${n(range(a, 0, 30))}deg)`),
        layers: [{ blendMode: "multiply", opacity: range(a, 0, 0.2) }],
      };
    case 14: // turquoise
      return {
        canvasFilter: scb(a, 1 - 0.46, 1.032, 1 - 0.14, `hue-rotate(${n(range(a, 0, 45))}deg)`),
        layers: [{ blendMode: "multiply", opacity: range(a, 0, 0.44) }],
      };
    case 15: // cool
      return {
        canvasFilter: scb(a, 1 - 0.48, 1.018, 1 - 0.13, `hue-rotate(${n(range(a, 0, 220))}deg)`),
        layers: [],
      };
    case 16:
      return { canvasFilter: modernParts(a, [["saturate", 1.35], ["contrast", 1.12], ["brightness", 1.03]]), layers: [] };
    case 17:
      return { canvasFilter: modernParts(a, [["contrast", 1.28], ["saturate", 1.3], ["brightness", 0.98]]), layers: [] };
    case 18:
      return { canvasFilter: modernParts(a, [["saturate", 0.72], ["brightness", 1.08], ["contrast", 0.94], ["hue-rotate", -8]]), layers: [] };
    case 19:
      return { canvasFilter: modernParts(a, [["sepia", 0.35], ["saturate", 1.3], ["contrast", 1.05], ["brightness", 1.06]]), layers: [] };
    case 20:
      return { canvasFilter: modernParts(a, [["sepia", 0.22], ["saturate", 1.12], ["brightness", 1.1], ["contrast", 0.94]]), layers: [] };
    case 21:
      return { canvasFilter: modernParts(a, [["saturate", 1.12], ["contrast", 1.06], ["brightness", 1.04], ["hue-rotate", -14]]), layers: [] };
    case 22:
      return {
        canvasFilter: modernParts(a, [["contrast", 0.88], ["brightness", 1.06], ["saturate", 0.82], ["sepia", 0.14]]),
        layers: [{ background: "#ffffff", blendMode: "lighten", opacity: 0.08 * a }],
      };
    case 23:
      return { canvasFilter: modernParts(a, [["sepia", 0.4], ["saturate", 1.35], ["hue-rotate", -12], ["contrast", 0.92]]), layers: [] };
    case 24:
      return { canvasFilter: modernParts(a, [["grayscale", 1], ["contrast", 1.06], ["brightness", 1.02]]), layers: [] };
    case 25:
      return {
        canvasFilter: modernParts(a, [["grayscale", 1], ["contrast", 1.45], ["brightness", 0.92]]),
        layers: [{ blendMode: "multiply", opacity: 0.5 * a }],
      };
    case 26:
      return { canvasFilter: modernParts(a, [["grayscale", 0.4], ["contrast", 1.25], ["brightness", 0.95], ["saturate", 1.1]]), layers: [] };
    case 27:
      return {
        canvasFilter: modernParts(a, [["brightness", 1.09], ["contrast", 0.9], ["saturate", 1.06]]),
        layers: [{ background: "#ffffff", blendMode: "screen", opacity: 0.1 * a }],
      };
    case 28:
      return {
        canvasFilter: modernParts(a, [["saturate", 1.45], ["contrast", 1.25]]),
        layers: [{ blendMode: "multiply", opacity: 0.55 * a }],
      };
    default:
      return { layers: [] };
  }
}

export type AdjustmentKey =
  | "brightness"
  | "contrast"
  | "saturation"
  | "hue"
  | "warmth"
  | "vignette";

function adjNumber(item: Partial<FilterItem>, key: AdjustmentKey): number {
  switch (key) {
    case "brightness":
      return item.adjBrightness ?? 0;
    case "contrast":
      return item.adjContrast ?? 0;
    case "saturation":
      return item.adjSaturation ?? 0;
    case "hue":
      return item.adjHue ?? 0;
    case "warmth":
      return item.adjWarmth ?? 0;
    case "vignette":
      return item.adjVignette ?? 0;
  }
}

export function adjustmentFilter(item: Partial<FilterItem>): string | undefined {
  const brightness = Math.max(0, 1 + adjNumber(item, "brightness") / 100);
  const contrast = Math.max(0, 1 + adjNumber(item, "contrast") / 100);
  const saturation = Math.max(0, 1 + adjNumber(item, "saturation") / 100);
  const hue = adjNumber(item, "hue");
  const filters: string[] = [];
  if (brightness !== 1) filters.push(`brightness(${n(brightness)})`);
  if (contrast !== 1) filters.push(`contrast(${n(contrast)})`);
  if (saturation !== 1) filters.push(`saturate(${n(saturation)})`);
  if (hue !== 0) filters.push(`hue-rotate(${n(hue)}deg)`);
  return filters.length ? filters.join(" ") : undefined;
}

export function adjustmentLayers(item: Partial<FilterItem>): FilterLayer[] {
  const warmth = adjNumber(item, "warmth");
  const vignette = adjNumber(item, "vignette");
  const layers: FilterLayer[] = [];
  if (warmth > 0) {
    layers.push({ background: "#ff9a3c", blendMode: "soft-light", opacity: (warmth / 100) * 0.85 });
  } else if (warmth < 0) {
    layers.push({ background: "#3c8dff", blendMode: "soft-light", opacity: (Math.abs(warmth) / 100) * 0.85 });
  }
  if (vignette > 0) {
    layers.push({ background: VIGNETTE_BACKGROUND, blendMode: "multiply", opacity: vignette / 100 });
  }
  return layers;
}

/** Human labels for the 15 filter looks (legacy PanelFilters grid order). */
export const FILTER_NAMES: Record<number, string> = {
  1: "Original",
  2: "Grayscale",
  3: "Sepia",
  4: "Vignette",
  5: "Lomo",
  6: "Orton",
  7: "Polaroid",
  8: "Retro",
  9: "Vintage",
  10: "Adventure",
  11: "Ignite",
  12: "Blonde",
  13: "Sense",
  14: "Turquoise",
  15: "Cool",
  16: "Vivid",
  17: "Fresco",
  18: "Nordic",
  19: "Golden",
  20: "Peach",
  21: "Calypso",
  22: "Film",
  23: "Retro Pop",
  24: "Mono",
  25: "Noir",
  26: "Street",
  27: "Dream",
  28: "Lomo 2.0",
};

/**
 * Faithful reproduction of assets/images/FilterLayer.png: a smooth radial
 * vignette (white centre → black edges), used as the overlay layer texture.
 */
export const VIGNETTE_BACKGROUND =
  "radial-gradient(ellipse 75% 75% at 50% 50%, #ffffff 0%, #d9d9d9 35%, #7a7a7a 72%, #000000 100%)";
