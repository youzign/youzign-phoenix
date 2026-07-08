import { describe, expect, it } from "vitest";
import { parse, type Design } from "@youzign/designstring";
import { fitCanvasToItem } from "../src/index.js";

function design(w: number, h: number, items = ""): Design {
  return parse(
    `<data canvas_width="${w}" canvas_height="${h}" bg_color="-1" bg_type="color" dpi="72">${items}</data>`
  );
}

function imageItem(attrs: Record<string, string | number>): string {
  const base: Record<string, string | number> = {
    type: "image",
    index: 0,
    xpos: 0,
    ypos: 0,
    width: 0,
    height: 0,
    rotation: 0,
    opacity: 1,
    is_shadow: "false",
    source: "x",
    ...attrs,
  };
  const a = Object.entries(base)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  return `<item ${a}/>`;
}

describe("fitCanvasToItem", () => {
  it("matches the canvas to the selected image box and centers the image", () => {
    const d = design(
      800,
      600,
      imageItem({ xpos: 300, ypos: 220, width: 320.4, height: 180.6 })
    );
    const image = d.items[0] as any;
    image._uid = 61;

    fitCanvasToItem(d, 61);

    expect(d.canvasWidth).toBe(320);
    expect(d.canvasHeight).toBe(181);
    expect(d.rawAttrs.canvas_width).toBe("320");
    expect(d.rawAttrs.canvas_height).toBe("181");
    expect(image.width).toBe(320.4);
    expect(image.height).toBe(180.6);
    expect(image.xpos).toBe(160);
    expect(image.ypos).toBe(90.5);
    expect(image.rawAttrs.xpos).toBe("160");
    expect(image.rawAttrs.ypos).toBe("90.5");
    expect(d.rawAttrs.bg_color).toBe("-1");
    expect(d.rawAttrs.bg_type).toBe("color");
  });

  it("does nothing when the uid is unknown", () => {
    const d = design(800, 600, imageItem({ xpos: 300, ypos: 220, width: 320, height: 180 }));
    const image = d.items[0] as any;
    image._uid = 61;

    fitCanvasToItem(d, 999);

    expect(d.canvasWidth).toBe(800);
    expect(d.canvasHeight).toBe(600);
    expect(d.rawAttrs.canvas_width).toBe("800");
    expect(d.rawAttrs.canvas_height).toBe("600");
    expect(image.xpos).toBe(300);
    expect(image.ypos).toBe(220);
  });

  it("does nothing when the item box has a zero dimension", () => {
    const d = design(800, 600, imageItem({ xpos: 300, ypos: 220, width: 0, height: 180 }));
    const image = d.items[0] as any;
    image._uid = 61;

    fitCanvasToItem(d, 61);

    expect(d.canvasWidth).toBe(800);
    expect(d.canvasHeight).toBe(600);
    expect(d.rawAttrs.canvas_width).toBe("800");
    expect(d.rawAttrs.canvas_height).toBe("600");
    expect(image.xpos).toBe(300);
    expect(image.ypos).toBe(220);
  });
});
