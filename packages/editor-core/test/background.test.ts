import { describe, it, expect } from "vitest";
import { parse, serialize, signedIntToHex, hexToSignedInt } from "@youzign/designstring";
import {
  GRADIENT_PRESETS,
  GRADIENT_ANGLES,
  setBackgroundColor,
  backgroundColorHex,
  setTransparent,
  setGradientPreset,
  setGradientStop,
  gradientStopHex,
  setGradientLinear,
  setGradientAngle,
  setGradientRatios,
  reverseGradient,
  setBorderWidth,
  setBorderColor,
  borderColorHex,
} from "../src/index.js";

const base = () =>
  parse(
    '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color"></data>'
  );

describe("gradient preset data", () => {
  it("ships the 25 legacy gradient presets, each a [hex, hex] pair", () => {
    expect(GRADIENT_PRESETS.length).toBe(25);
    for (const [a, b] of GRADIENT_PRESETS) {
      expect(a).toMatch(/^#[0-9a-f]{6}$/);
      expect(b).toMatch(/^#[0-9a-f]{6}$/);
    }
    // spot-check first + last against PanelBackgroundGradient.ts
    expect(GRADIENT_PRESETS[0]).toEqual(["#f1d611", "#c27a01"]);
    expect(GRADIENT_PRESETS[24]).toEqual(["#dbabd3", "#eb0045"]);
  });

  it("exposes the 8 legacy angle presets", () => {
    expect(GRADIENT_ANGLES).toEqual([90, 45, 0, -45, -90, -135, 180, 135]);
  });
});

describe("solid background + transparent", () => {
  it("setBackgroundColor writes bg_type/bg_color(signed int)/transparent", () => {
    const d = base();
    setBackgroundColor(d, "#3366ff");
    expect(d.bgType).toBe("color");
    expect(d.transparent).toBe(false);
    expect(d.bgColor).toBe(hexToSignedInt("#3366ff"));
    expect(backgroundColorHex(d)).toBe("#3366ff");
    expect(d.rawAttrs.bg_color).toBe(String(hexToSignedInt("#3366ff")));
    expect(d.rawAttrs.bg_type).toBe("color");
    expect(d.rawAttrs.transparent).toBe("false");
  });

  it("setTransparent round-trips through serialize", () => {
    const d = base();
    setTransparent(d, true);
    expect(d.transparent).toBe(true);
    expect(serialize(d)).toContain('transparent="true"');
  });
});

describe("gradient mutations", () => {
  it("applying a preset sets gradient stops as signed ints + resets ratios", () => {
    const d = base();
    setGradientPreset(d, 3);
    const [a, b] = GRADIENT_PRESETS[3];
    expect(d.bgType).toBe("gradient");
    expect(d.transparent).toBe(false);
    expect(d.grad1).toBe(hexToSignedInt(a));
    expect(d.grad2).toBe(hexToSignedInt(b));
    expect(gradientStopHex(d, 1)).toBe(a);
    expect(gradientStopHex(d, 2)).toBe(b);
    // bunched default (0..0) → reset to full spread
    expect(d.ratio1).toBe(0);
    expect(d.ratio2).toBe(255);
  });

  it("setGradientStop writes grad1/grad2 attributes", () => {
    const d = base();
    setGradientStop(d, 1, "#ff0000");
    setGradientStop(d, 2, "#00ff00");
    expect(d.rawAttrs.grad1).toBe(String(hexToSignedInt("#ff0000")));
    expect(d.rawAttrs.grad2).toBe(String(hexToSignedInt("#00ff00")));
  });

  it("angle preset forces linear mode", () => {
    const d = base();
    setGradientLinear(d, false);
    setGradientAngle(d, 135);
    expect(d.isLinear).toBe(true);
    expect(d.angle).toBe(135);
    expect(d.rawAttrs.is_linear).toBe("true");
    expect(d.rawAttrs.angle).toBe("135");
  });

  it("linear/radial toggle writes is_linear", () => {
    const d = base();
    setGradientLinear(d, false);
    expect(d.isLinear).toBe(false);
    expect(d.rawAttrs.is_linear).toBe("false");
  });

  it("setGradientRatios writes 0-255 stops", () => {
    const d = base();
    setGradientRatios(d, 40, 200);
    expect(d.ratio1).toBe(40);
    expect(d.ratio2).toBe(200);
    expect(d.rawAttrs.ratio1).toBe("40");
    expect(d.rawAttrs.ratio2).toBe("200");
  });

  it("reverse swaps grad1/grad2 and flips is_reverse", () => {
    const d = base();
    setGradientStop(d, 1, "#ff0000");
    setGradientStop(d, 2, "#00ff00");
    reverseGradient(d);
    expect(gradientStopHex(d, 1)).toBe("#00ff00");
    expect(gradientStopHex(d, 2)).toBe("#ff0000");
    expect(d.isReverse).toBe(true);
    expect(d.rawAttrs.is_reverse).toBe("true");
    reverseGradient(d);
    expect(gradientStopHex(d, 1)).toBe("#ff0000");
    expect(d.isReverse).toBe(false);
  });
});

describe("canvas border", () => {
  it("sets width + color (signed int) faithfully", () => {
    const d = base();
    setBorderWidth(d, 12);
    setBorderColor(d, "#123456");
    expect(d.borderWidth).toBe(12);
    expect(d.borderColor).toBe(hexToSignedInt("#123456"));
    expect(borderColorHex(d)).toBe("#123456");
    expect(d.rawAttrs.border_width).toBe("12");
    expect(d.rawAttrs.border_color).toBe(String(hexToSignedInt("#123456")));
  });
});

describe("byte-faithful round-trip", () => {
  it("a design with no background edits serializes unchanged", () => {
    const xml =
      '<?xml version="1.0" encoding="utf-8"?>\n<data bg_color="-1" bg_type="color" canvas_width="800" canvas_height="600">\n</data>\n';
    expect(serialize(parse(xml))).toBe(xml);
  });

  it("editing only the background leaves the <data> the sole changed element", () => {
    const d = parse(
      '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color" grad1="0" grad2="0" ratio1="0" ratio2="255" angle="0" is_linear="true"></data>'
    );
    setGradientPreset(d, 0);
    const out = serialize(d);
    // signed-int stops present, hex never leaks into the designstring
    expect(out).toContain(`grad1="${hexToSignedInt(GRADIENT_PRESETS[0][0])}"`);
    expect(out).not.toContain("#f1d611");
    // consistency: renderer's signedIntToHex recovers the preset hex
    expect(signedIntToHex(d.grad1)).toBe(GRADIENT_PRESETS[0][0]);
  });
});
