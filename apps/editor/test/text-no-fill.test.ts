import { describe, expect, it } from "vitest";
import { serialize } from "@youzign/designstring";
import { useEditor } from "../src/store.js";

const TEXT_XML =
  '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color">\n' +
  '  <item type="text" index="0" xpos="400" ypos="300" size="40" width="0" height="0" rotation="0" opacity="1" font="Arvo" fontType="External Font" color="0@@@0" alignment="center" scalex="1" scaley="1" wrapping="false" scaleUsed="true" textAreaWidth="200" textAreaHeight="60" mcWidth="200" mcHeight="60" textAreaxpos="-100" textAreaypos="-30" bold="false" italic="false" isNoFill="false" underline="false"><![CDATA[Hi]]></item>\n' +
  "</data>";

describe("text no-fill", () => {
  it("sets text no-fill through the legacy isNoFill attribute", () => {
    useEditor.getState().load(TEXT_XML, "text");
    const item = useEditor.getState().design.items[0] as any;
    useEditor.getState().select(item._uid);
    useEditor.getState().setSelectedTextNoFill();

    const updated = useEditor.getState().design.items[0] as any;
    expect(updated.isNoFill).toBe(true);
    expect(updated.rawAttrs.isNoFill).toBe("true");
    expect(serialize(useEditor.getState().design)).toContain('isNoFill="true"');
  });
});
