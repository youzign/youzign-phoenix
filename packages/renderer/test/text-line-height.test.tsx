import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "@youzign/designstring";
import { DesignCanvas } from "../src/DesignCanvas.js";
import { textLineHeight } from "../src/items.js";

// Real "snatchems beerfest pod" (7YgkgPFJ, design_id 14603375) heading item.
// The display heading "free \nmid-week stay in a luxury pod*" is a 2-line
// non-wrapping text item. Its textAreaHeight (78) is the height of BOTH lines;
// the old renderer used textAreaHeight as EVERY line's height, so line 2
// dropped a full box-height down onto the body copy.
const heading = {
  wrapping: false,
  size: 21,
  textAreaHeight: 78,
  content: "free \nmid-week stay in a luxury pod*",
};

describe("textLineHeight — non-wrapping legacy text", () => {
  it("splits textAreaHeight across the lines of a multi-line heading", () => {
    // 78 / 2 lines = 39 (>= size*1.2 = 25.2). Old code returned 78 → 2× tall.
    expect(textLineHeight(heading)).toBe(39);
  });

  it("keeps a single non-wrapping line at the full textAreaHeight (byte-stable)", () => {
    // "visit www.riponmuseums.co.uk for more info" (index 4): 1 line, taH 42.65.
    expect(
      textLineHeight({ wrapping: false, size: 32, textAreaHeight: 42.65, content: "visit www…" })
    ).toBe(42.65);
  });

  it("applies the size*1.2 floor when textAreaHeight/lineCount is too small", () => {
    // 3 lines into a 30px box → 10px < 12*1.2=14.4, so the floor wins.
    expect(
      textLineHeight({ wrapping: false, size: 12, textAreaHeight: 30, content: "a\nb\nc" })
    ).toBeCloseTo(14.4);
  });

  it("leaves wrapping text on the size*1.2 leading", () => {
    expect(textLineHeight({ wrapping: true, size: 36, textAreaHeight: 360, content: "a\nb" })).toBe(
      36 * 1.2
    );
  });
});

// Full-pipeline guard: the converted heading XML must render with a per-line
// height that keeps the 2-line block inside its textAreaHeight, not 2× it.
const headingXml =
  '<data canvas_width="1800" canvas_height="750" bg_color="-1" bg_type="color">\n' +
  '  <item type="text" index="0" xpos="1298.4" ypos="160.3" size="21" width="0" height="0" ' +
  'rotation="0" opacity="1" font="Arvo" fontType="External Font" color="0" alignment="center" ' +
  'scalex="1" scaley="1" wrapping="false" scaleUsed="true" textAreaWidth="173.05" ' +
  'textAreaHeight="78" mcWidth="440" mcHeight="198.3" textAreaxpos="-86.525" textAreaypos="-39" ' +
  'bold="false" italic="false" underline="false">' +
  "<![CDATA[free \nmid-week stay in a luxury pod*]]></item>\n" +
  "</data>";

describe("snatchems heading — rendered line-height", () => {
  it("emits line-height:39px (not 78px) for the 2-line non-wrapping heading", () => {
    const html = renderToStaticMarkup(<DesignCanvas design={parse(headingXml)} />);
    expect(html).toContain("line-height:39px");
    expect(html).not.toContain("line-height:78px");
  });
});
