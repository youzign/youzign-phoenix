import { describe, expect, it } from "vitest";
import {
  createImageItem,
  createTextItem,
  itemBox,
  measuredTextBox,
  textMatrixCenterOffset,
  type TextMeasureResult,
} from "../src/index.js";
import { parse } from "@youzign/designstring";

const EMPTY = '<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color"></data>';

function fixedMeasure(text: string): TextMeasureResult {
  return {
    width: text.length * 10,
    actualBoundingBoxAscent: 16,
    actualBoundingBoxDescent: 4,
  };
}

function rotateOffset(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

function compensateTextRotation(
  item: ReturnType<typeof createTextItem>,
  center: { x: number; y: number },
  rotation: number
) {
  const sx = item.textAreaWidth ? item.mcWidth / item.textAreaWidth : 1;
  const sy = item.textAreaHeight ? item.mcHeight / item.textAreaHeight : 1;
  const offset = textMatrixCenterOffset(item, fixedMeasure);
  const rotated = rotateOffset(offset.x, offset.y, rotation);
  const origin = { x: center.x - rotated.x, y: center.y - rotated.y };
  item.rotation = rotation;
  item.xpos = origin.x - item.textAreaxpos * sx;
  item.ypos = origin.y - item.textAreaypos * sy;
}

function expectCenterStable(item: ReturnType<typeof createTextItem>) {
  const start = measuredTextBox(item, fixedMeasure);
  for (const angle of [15, 45, 120, 300]) {
    const rotated = { ...item };
    compensateTextRotation(rotated, { x: start.cx, y: start.cy }, angle);
    const box = measuredTextBox(rotated, fixedMeasure);
    expect(Math.hypot(box.cx - start.cx, box.cy - start.cy)).toBeLessThan(0.01);
  }
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

  it("keeps a non-wrapped text visual center fixed when rotation is compensated", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 400, 300, {
      content: "Center",
      size: 20,
      width: 200,
      alignment: "left",
    });
    item.textAreaWidth = 200;
    item.textAreaHeight = 40;
    item.mcWidth = 200;
    item.mcHeight = 40;
    item.textAreaxpos = -100;
    item.textAreaypos = -20;

    expectCenterStable(item);
  });

  it("keeps a wrapped text visual center fixed when rotation is compensated", () => {
    const d = parse(EMPTY);
    const item = createTextItem(d, 400, 300, {
      content: "Alpha Beta Gamma",
      size: 20,
      width: 70,
      alignment: "left",
    });
    item.wrapping = true;
    item.textAreaWidth = 70;
    item.textAreaHeight = 60;
    item.mcWidth = 70;
    item.mcHeight = 60;
    item.textAreaxpos = -35;
    item.textAreaypos = -30;

    expectCenterStable(item);
  });

  it("leaves image rotation centered on item geometry", () => {
    const d = parse(EMPTY);
    const image = createImageItem(d, "data:image/png;base64,stub", 320, 240, {
      width: 120,
      height: 80,
    });
    const start = itemBox(image);

    image.rotation = 120;
    const box = itemBox(image);

    expect(box.cx).toBe(start.cx);
    expect(box.cy).toBe(start.cy);
    expect(box.w).toBe(start.w);
    expect(box.h).toBe(start.h);
    expect(box.rotation).toBe(120);
  });
});
