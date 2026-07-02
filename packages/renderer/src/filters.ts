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

/** Legacy Utils.ts percentToRange. */
function range(percent: number, min: number, max: number): number {
  return (max - min) * percent + min;
}

/** Trim to at most 6 dp so the CSS string stays tidy and deterministic. */
const n = (x: number) => `${Math.round(x * 1e6) / 1e6}`;

export interface FilterLayer {
  blendMode: string;
  opacity: number;
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
    default:
      return { layers: [] };
  }
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
};

/**
 * Faithful reproduction of assets/images/FilterLayer.png: a smooth radial
 * vignette (white centre → black edges), used as the overlay layer texture.
 */
export const VIGNETTE_BACKGROUND =
  "radial-gradient(ellipse 75% 75% at 50% 50%, #ffffff 0%, #d9d9d9 35%, #7a7a7a 72%, #000000 100%)";
