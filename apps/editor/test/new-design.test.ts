import { describe, expect, it } from "vitest";
import { imageDocument, startImageDims, START_IMAGE_MAX_DIM } from "../src/newDesign.js";

describe("start-from-image sizing", () => {
  it("keeps images at their natural dimensions under the cap", () => {
    expect(startImageDims(4000, 3000)).toEqual({
      width: 4000,
      height: 3000,
      scale: 1,
      scaled: false,
    });
  });

  it("caps the longest side to 6000px", () => {
    const dims = startImageDims(9000, 4500);
    expect(dims.scaled).toBe(true);
    expect(dims.width).toBe(START_IMAGE_MAX_DIM);
    expect(dims.height).toBe(3000);
  });

  it("creates a document matching the image with a full-bleed image item", () => {
    const doc = imageDocument("data:image/png;base64,x", 640, 480);
    const design = doc.pages[0].design;
    expect(design.canvasWidth).toBe(640);
    expect(design.canvasHeight).toBe(480);
    expect(design.items).toHaveLength(1);
    expect(design.items[0]).toMatchObject({
      type: "image",
      xpos: 320,
      ypos: 240,
      width: 640,
      height: 480,
      source: "data:image/png;base64,x",
    });
  });
});
