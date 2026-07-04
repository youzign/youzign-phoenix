import { describe, it, expect } from "vitest";
import {
  adjustmentFilter,
  adjustmentLayers,
  filterRecipe,
  FILTER_NAMES,
  VIGNETTE_BACKGROUND,
} from "../src/filters.js";
import { effectFilter, blendModeCss, cornerRadiusCss } from "../src/effects.js";

describe("filterRecipe — faithful port of PanelFilters.ts updateFilter()", () => {
  it("original (1) is a no-op", () => {
    expect(filterRecipe(1, 1)).toEqual({ layers: [] });
  });

  it("grayscale (2) and sepia (3) use alpha directly as the CSS amount", () => {
    expect(filterRecipe(2, 0.5).canvasFilter).toBe("grayscale(0.5)");
    expect(filterRecipe(3, 1).canvasFilter).toBe("sepia(1)");
  });

  it("vignette (4) has two overlay/multiply layers scaled by percentToRange", () => {
    const r = filterRecipe(4, 1);
    expect(r.canvasFilter).toBeUndefined();
    expect(r.layers).toEqual([
      { blendMode: "overlay", opacity: 0.59 },
      { blendMode: "multiply", opacity: 0.24 },
    ]);
    // at half alpha the opacities halve (range from 0)
    expect(filterRecipe(4, 0.5).layers[0].opacity).toBeCloseTo(0.295);
  });

  it("orton (6) is saturate/contrast/brightness with range(a,1,val)", () => {
    expect(filterRecipe(6, 1).canvasFilter).toBe(
      "saturate(1.12) contrast(1.2) brightness(1.27)"
    );
    // alpha 0 → neutral (all 1)
    expect(filterRecipe(6, 0).canvasFilter).toBe(
      "saturate(1) contrast(1) brightness(1)"
    );
  });

  it("retro (8) appends a sepia() custom filter and an overlay layer", () => {
    const r = filterRecipe(8, 1);
    expect(r.canvasFilter).toBe(
      "saturate(0.63) contrast(1.15) brightness(1.21) sepia(0.8)"
    );
    expect(r.layers).toEqual([{ blendMode: "overlay", opacity: 0.7 }]);
  });

  it("cool (15) hue-rotates up to 220deg", () => {
    expect(filterRecipe(15, 1).canvasFilter).toBe(
      "saturate(0.52) contrast(1.018) brightness(0.87) hue-rotate(220deg)"
    );
  });

  it("modern preset pack (16-28) resolves exact alpha-1 strings", () => {
    expect(filterRecipe(16, 1).canvasFilter).toBe("saturate(1.35) contrast(1.12) brightness(1.03)");
    expect(filterRecipe(17, 1).canvasFilter).toBe("contrast(1.28) saturate(1.3) brightness(0.98)");
    expect(filterRecipe(18, 1).canvasFilter).toBe("saturate(0.72) brightness(1.08) contrast(0.94) hue-rotate(-8deg)");
    expect(filterRecipe(19, 1).canvasFilter).toBe("sepia(0.35) saturate(1.3) contrast(1.05) brightness(1.06)");
    expect(filterRecipe(20, 1).canvasFilter).toBe("sepia(0.22) saturate(1.12) brightness(1.1) contrast(0.94)");
    expect(filterRecipe(21, 1).canvasFilter).toBe("saturate(1.12) contrast(1.06) brightness(1.04) hue-rotate(-14deg)");
    expect(filterRecipe(22, 1).canvasFilter).toBe("contrast(0.88) brightness(1.06) saturate(0.82) sepia(0.14)");
    expect(filterRecipe(23, 1).canvasFilter).toBe("sepia(0.4) saturate(1.35) hue-rotate(-12deg) contrast(0.92)");
    expect(filterRecipe(24, 1).canvasFilter).toBe("grayscale(1) contrast(1.06) brightness(1.02)");
    expect(filterRecipe(25, 1).canvasFilter).toBe("grayscale(1) contrast(1.45) brightness(0.92)");
    expect(filterRecipe(26, 1).canvasFilter).toBe("grayscale(0.4) contrast(1.25) brightness(0.95) saturate(1.1)");
    expect(filterRecipe(27, 1).canvasFilter).toBe("brightness(1.09) contrast(0.9) saturate(1.06)");
    expect(filterRecipe(28, 1).canvasFilter).toBe("saturate(1.45) contrast(1.25)");
    expect(filterRecipe(22, 1).layers).toEqual([{ background: "#ffffff", blendMode: "lighten", opacity: 0.08 }]);
    expect(filterRecipe(25, 1).layers).toEqual([{ blendMode: "multiply", opacity: 0.5 }]);
  });

  it("modern presets interpolate toward neutral", () => {
    expect(filterRecipe(16, 0.5).canvasFilter).toBe("saturate(1.175) contrast(1.06) brightness(1.015)");
    expect(filterRecipe(24, 0.5).canvasFilter).toBe("grayscale(0.5) contrast(1.03) brightness(1.01)");
    expect(filterRecipe(28, 0.5).layers[0].opacity).toBeCloseTo(0.275);
    expect(filterRecipe(16, 0).canvasFilter).toBe("saturate(1) contrast(1) brightness(1)");
    expect(filterRecipe(24, 0).canvasFilter).toBe("grayscale(0) contrast(1) brightness(1)");
    expect(filterRecipe(28, 0).layers[0].opacity).toBe(0);
  });

  it("maps canvas adjustments to CSS filters and overlay layers", () => {
    const item = {
      adjBrightness: 40,
      adjContrast: -20,
      adjSaturation: 15,
      adjHue: -30,
      adjWarmth: 60,
      adjVignette: 25,
    };
    expect(adjustmentFilter(item)).toBe("brightness(1.4) contrast(0.8) saturate(1.15) hue-rotate(-30deg)");
    expect(adjustmentLayers(item)).toEqual([
      { background: "#ff9a3c", blendMode: "soft-light", opacity: 0.51 },
      { background: VIGNETTE_BACKGROUND, blendMode: "multiply", opacity: 0.25 },
    ]);
    expect(adjustmentFilter({ adjBrightness: -150 })).toBe("brightness(0)");
    expect(adjustmentLayers({ adjWarmth: -20 })).toEqual([
      { background: "#3c8dff", blendMode: "soft-light", opacity: 0.17 },
    ]);
    expect(adjustmentFilter({})).toBeUndefined();
    expect(adjustmentLayers({})).toEqual([]);
  });

  it("exposes all 28 look names", () => {
    expect(Object.keys(FILTER_NAMES)).toHaveLength(28);
    expect(FILTER_NAMES[9]).toBe("Vintage");
    expect(FILTER_NAMES[24]).toBe("Mono");
  });
});

describe("per-item invert / blend / corner-radius", () => {
  it("invert appends invert(<intensity>%) to the filter chain", () => {
    expect(effectFilter({ isInvert: true, invertIntensity: 80 })).toBe("invert(80%)");
    expect(effectFilter({ isInvert: false })).toBeUndefined();
  });

  it("blendModeCss suppresses the default 'normal'", () => {
    expect(blendModeCss({ blendMode: "multiply" })).toBe("multiply");
    expect(blendModeCss({ blendMode: "normal" })).toBeUndefined();
    expect(blendModeCss({})).toBeUndefined();
  });

  it("cornerRadiusCss emits TL TR BR BL and clamps negatives to 0", () => {
    expect(
      cornerRadiusCss({
        inputCornerTopLeft: 10,
        inputCornerTopRight: 20,
        inputCornerBottomLeft: 30,
        inputCornerBottomRight: 40,
      })
    ).toBe("10px 20px 40px 30px");
    expect(cornerRadiusCss({ inputCornerTopLeft: -5 })).toBeUndefined();
    expect(cornerRadiusCss({})).toBeUndefined();
  });
});
