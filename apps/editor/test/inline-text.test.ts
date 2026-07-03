import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { useEditor } from "../src/store.js";

const TEXT_XML =
  '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color">\n' +
  '  <item type="text" index="0" xpos="400" ypos="300" size="40" width="0" height="0" rotation="0" opacity="1" font="Arvo" fontType="External Font" color="0@@@0" alignment="center" scalex="1" scaley="1" wrapping="false" scaleUsed="true" textAreaWidth="200" textAreaHeight="60" mcWidth="200" mcHeight="60" textAreaxpos="-100" textAreaypos="-30" bold="false" italic="false" isNoFill="false" underline="false"><![CDATA[Hi]]></item>\n' +
  "</data>";

describe("inline text editing", () => {
  it("commits text content as one undoable model step", () => {
    useEditor.getState().load(TEXT_XML, "text");
    const item = useEditor.getState().design.items[0] as any;
    useEditor.getState().setContentByUid(item._uid, "Changed");

    expect((useEditor.getState().design.items[0] as any).content).toBe("Changed");
    expect(useEditor.getState().past).toHaveLength(1);

    useEditor.getState().undo();
    expect((useEditor.getState().design.items[0] as any).content).toBe("Hi");
  });

  it("registers a capture-phase click-away commit for inline text editing", () => {
    const canvasStage = readFileSync(resolve(__dirname, "../src/components/CanvasStage.tsx"), "utf8");

    expect(canvasStage).toContain('window.addEventListener("pointerdown", onPointerDown, true)');
    expect(canvasStage).toContain("inlineCommitRef.current?.()");
    expect(canvasStage).toContain("setContentByUid(single, text)");
  });
});
