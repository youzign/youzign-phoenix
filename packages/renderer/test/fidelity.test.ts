import { describe, it, expect } from "vitest";
import { filterRecipe, FILTER_NAMES } from "../src/filters.js";
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

  it("exposes all 15 look names", () => {
    expect(Object.keys(FILTER_NAMES)).toHaveLength(15);
    expect(FILTER_NAMES[9]).toBe("Vintage");
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
