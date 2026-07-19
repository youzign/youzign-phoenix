import { describe, expect, it } from "vitest";
import { isSvgSource } from "../src/clipart.js";

// isSvgSource decides whether a clipart source is inlined + recolored (SVG) or
// rendered as a plain <img> (raster). The legacy-import flow rewrites every
// asset — including the clipart SVG — into a base64 data URL, so the renderer
// must recognise the data-URL form too, or the item renders in the SVG's
// default fill instead of its stored color(s). Regression guard for that bug.
describe("isSvgSource", () => {
  it("matches plain .svg URLs (desktop / live backend)", () => {
    expect(isSvgSource("https://youzign.com/wp-content/uploads/2020/12/x.svg")).toBe(true);
    expect(isSvgSource("/clipart/triangle.svg")).toBe(true);
    expect(isSvgSource("https://cdn/x.svg?cacheblock=true")).toBe(true);
    expect(isSvgSource("https://cdn/x.svg#frag")).toBe(true);
  });

  it("matches inlined data:image/svg+xml URLs (import flow)", () => {
    expect(isSvgSource("data:image/svg+xml;base64,PHN2ZyB4bWxucz0i")).toBe(true);
    expect(isSvgSource("data:image/svg+xml,%3Csvg%3E")).toBe(true);
    expect(isSvgSource("DATA:IMAGE/SVG+XML;base64,PHN2Zz4=")).toBe(true);
  });

  it("rejects raster sources (rendered as <img>, never recolored)", () => {
    expect(isSvgSource("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
    expect(isSvgSource("https://s3/foo.png")).toBe(false);
    expect(isSvgSource("https://s3/shape.swf")).toBe(false);
    expect(isSvgSource("")).toBe(false);
  });
});

// The rescued built-in cliparts are bundled as .svg under public/legacy-clipart/
// and legacy imports rewrite `assets/graphics/*.swf` sources to those URLs. The
// bundled URL MUST be recognised as an SVG source so it routes through the
// inline + per-layer recolor path (not the raster <img> path); that's how the
// item's stored colors keep applying. (inlineClipartSvg itself needs a DOM and
// is exercised in the browser; here we guard the routing seam.)
describe("bundled legacy-clipart URLs route through the SVG recolor path", () => {
  it("treats a bundled /legacy-clipart/*.svg source as an SVG (recolored, not raster)", () => {
    expect(isSvgSource("/legacy-clipart/shapes_square.svg")).toBe(true);
    expect(isSvgSource("/editor/legacy-clipart/academic_sports_light_bulb.svg")).toBe(true);
  });
});
