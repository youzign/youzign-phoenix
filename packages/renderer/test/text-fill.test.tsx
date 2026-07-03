import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "@youzign/designstring";
import { DesignCanvas } from "../src/DesignCanvas.js";

const textXml = (attrs: string) =>
  '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color">\n' +
  `  <item type="text" index="0" xpos="200" ypos="120" size="40" width="0" height="0" rotation="0" opacity="1" font="Arvo" fontType="External Font" color="-65536@@@-65536" alignment="center" scalex="1" scaley="1" wrapping="false" scaleUsed="true" textAreaWidth="200" textAreaHeight="60" mcWidth="200" mcHeight="60" textAreaxpos="-100" textAreaypos="-30" bold="false" italic="false" underline="false" ${attrs}><![CDATA[No fill]]></item>\n` +
  "</data>";

describe("text no-fill rendering", () => {
  it("renders transparent glyph fill whenever isNoFill is true", () => {
    const design = parse(textXml('isNoFill="true"'));

    const html = renderToStaticMarkup(<DesignCanvas design={design} />);

    expect(html).toContain("color:transparent");
  });

  it("keeps outline effects visible when text fill is transparent", () => {
    const design = parse(
      textXml('isNoFill="true" is_border="true" border_size="3" border_color="-13408513"')
    );

    const html = renderToStaticMarkup(<DesignCanvas design={design} />);

    expect(html).toContain("color:transparent");
    expect(html).toContain("text-shadow");
  });
});
