import { describe, expect, it } from "vitest";
import { createTextItem, measuredTextBox, type TextMeasureResult } from "../src/index.js";
import { parse } from "@youzign/designstring";

const EMPTY = '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color"></data>';

function fixedMeasure(text: string): TextMeasureResult {
  return {
    width: text.length * 10,
    actualBoundingBoxAscent: 16,
    actualBoundingBoxDescent: 4,
  };
}

describe("measuredTextBox", () => {
  it("hugs measured glyph width instead of the stored text area", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 400, 300, {
      content: "Hi",
      size: 20,
      width: 200,
      alignment: "left",
    });
    const box = measuredTextBox(item, fixedMeasure);
    expect(box.w).toBe(20);
    expect(box.h).toBe(20);
    expect(box.cx).toBe(310);
  });

  it("accounts for alignment inside the text area", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 400, 300, {
      content: "Hi",
      size: 20,
      width: 200,
      alignment: "center",
    });
    const box = measuredTextBox(item, fixedMeasure);
    expect(box.w).toBe(20);
    expect(box.cx).toBe(400);
  });

  it("uses the stored wrap area when legacy wrapping is enabled", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 400, 300, {
      content: "Alpha Beta",
      size: 20,
      width: 60,
      alignment: "left",
    });
    item.wrapping = true;
    item.rawAttrs.wrapping = "true";
    const box = measuredTextBox(item, fixedMeasure);
    expect(box.w).toBe(60);
    expect(box.h).toBe(item.mcHeight);
    expect(box.cx).toBe(400);
  });
});
