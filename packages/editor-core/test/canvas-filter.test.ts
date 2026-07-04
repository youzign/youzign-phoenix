import { describe, expect, it } from "vitest";
import { parse, serialize, type Design, type FilterItem } from "../../designstring/src/index.js";
import {
  resetCanvasAdjustments,
  setCanvasAdjustment,
  setCanvasFilter,
  setCanvasFilterAlpha,
} from "../src/index.js";

const xml =
  '<data canvas_width="800" canvas_height="600" bg_type="color" bg_color="16777215">' +
  "</data>";

function design(): Design {
  return parse(xml);
}

function filter(d: Design): FilterItem | undefined {
  return d.items.find((it) => it.type === "filter") as FilterItem | undefined;
}

describe("canvas filter mutations", () => {
  it("upserts a filter item with rawAttrs and attrOrder", () => {
    const d = design();
    setCanvasFilter(d, 24);
    expect(filter(d)).toMatchObject({ type: "filter", filterid: 24, opacity: 1 });
    expect(filter(d)?.rawAttrs).toEqual({ type: "filter", filterid: "24", opacity: "1" });
    expect(filter(d)?.attrOrder).toEqual(["type", "filterid", "opacity"]);
  });

  it("switches preset id and writes opacity", () => {
    const d = design();
    setCanvasFilter(d, 16);
    setCanvasFilter(d, 28);
    setCanvasFilterAlpha(d, 0.4);
    expect(filter(d)?.filterid).toBe(28);
    expect(filter(d)?.opacity).toBe(0.4);
    expect(filter(d)?.rawAttrs.filterid).toBe("28");
    expect(filter(d)?.rawAttrs.opacity).toBe("0.4");
  });

  it("removes Original when no adjustments exist", () => {
    const d = design();
    setCanvasFilter(d, 16);
    setCanvasFilter(d, null);
    expect(filter(d)).toBeUndefined();
  });

  it("keeps Original when adjustments are non-neutral", () => {
    const d = design();
    setCanvasAdjustment(d, "brightness", 40);
    setCanvasFilter(d, null);
    expect(filter(d)).toMatchObject({ filterid: 1, adjBrightness: 40 });
    expect(filter(d)?.rawAttrs.filterid).toBe("1");
    expect(filter(d)?.rawAttrs.adj_brightness).toBe("40");
  });

  it("adds adjustment attrs only when non-neutral and removes them at neutral", () => {
    const d = design();
    setCanvasFilter(d, 24);
    setCanvasAdjustment(d, "warmth", 60);
    expect(filter(d)?.adjWarmth).toBe(60);
    expect(filter(d)?.rawAttrs.adj_warmth).toBe("60");
    expect(filter(d)?.attrOrder).toEqual(["type", "filterid", "opacity", "adj_warmth"]);
    setCanvasAdjustment(d, "warmth", 0);
    expect(filter(d)?.adjWarmth).toBe(0);
    expect(filter(d)?.rawAttrs.adj_warmth).toBeUndefined();
    expect(filter(d)?.attrOrder).toEqual(["type", "filterid", "opacity"]);
  });

  it("reset clears adjustment attrs and removes neutral Original", () => {
    const d = design();
    setCanvasAdjustment(d, "vignette", 30);
    expect(filter(d)).toBeDefined();
    resetCanvasAdjustments(d);
    expect(filter(d)).toBeUndefined();
  });

  it("edited design serializes and re-parses typed filter values", () => {
    const d = design();
    setCanvasFilter(d, 27);
    setCanvasFilterAlpha(d, 0.65);
    setCanvasAdjustment(d, "brightness", 22);
    setCanvasAdjustment(d, "hue", -45);
    const reparsed = parse(serialize(d));
    const item = filter(reparsed);
    expect(item).toMatchObject({
      filterid: 27,
      opacity: 0.65,
      adjBrightness: 22,
      adjHue: -45,
    });
    expect(item?.rawAttrs.adj_brightness).toBe("22");
    expect(item?.rawAttrs.adj_hue).toBe("-45");
  });
});
