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

  it("rotates wrapped text bounds around the renderer text matrix origin", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 400, 300, {
      content: "Alpha Beta",
      size: 20,
      width: 60,
      alignment: "left",
    });
    item.wrapping = true;
    item.rotation = 90;
    item.textAreaWidth = 60;
    item.textAreaHeight = 40;
    item.mcWidth = 60;
    item.mcHeight = 40;
    item.textAreaxpos = -30;
    item.textAreaypos = -20;

    const box = measuredTextBox(item, fixedMeasure);
    expect(box.w).toBe(60);
    expect(box.h).toBe(40);
    expect(box.cx).toBeCloseTo(350);
    expect(box.cy).toBeCloseTo(310);
  });

  it("rotates non-wrapped glyph bounds around the renderer text matrix origin", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 400, 300, {
      content: "Hi",
      size: 20,
      width: 200,
      alignment: "left",
    });
    item.rotation = 90;
    item.textAreaWidth = 200;
    item.textAreaHeight = 40;
    item.mcWidth = 200;
    item.mcHeight = 40;
    item.textAreaxpos = -100;
    item.textAreaypos = -20;

    const box = measuredTextBox(item, fixedMeasure);
    expect(box.w).toBe(20);
    expect(box.h).toBe(20);
    expect(box.cx).toBeCloseTo(280);
    expect(box.cy).toBeCloseTo(290);
  });
});
