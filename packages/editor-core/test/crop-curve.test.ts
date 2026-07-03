import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse, serialize } from "@youzign/designstring";
import type { ImageItem, TextCurvedItem } from "@youzign/designstring";
import {
  setCurve,
  curveAmount,
  computeCrop,
  applyCrop,
  composeCropRect,
  canvasRectToFullSourceRect,
  fullSourceRectToCanvasGeom,
  fullSourceCanvasBounds,
  currentCropCanvasRect,
  type ImageCropMemory,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const XML = readFileSync(
  resolve(__dirname, "../../../apps/editor/src/fixtures/crop-curve.xml"),
  "utf8"
);

const curved = () => parse(XML).items.find((i) => i.type === "text-curved") as TextCurvedItem;
const image = () => parse(XML).items.find((i) => i.type === "image") as ImageItem;

describe("crop-curve fixture round-trip", () => {
  it("is byte-stable through parse -> serialize with no edits", () => {
    expect(serialize(parse(XML))).toBe(serialize(parse(XML)));
    // idempotent reparse
    expect(serialize(parse(serialize(parse(XML))))).toBe(serialize(parse(XML)));
  });
});

describe("setCurve / curveAmount — legacy arc attributes", () => {
  it("writes symmetric start/end angles, radius and direction for a positive amount", () => {
    const it = curved();
    setCurve(it, 80);
    expect(it.topDirection).toBe(true);
    expect(it.startAngle).toBe(-72); // (80/100)*180 = 144° span, symmetric
    expect(it.endAngle).toBe(72);
    expect(it.radius).toBeGreaterThan(0);
    // raw attrs stay in sync (drive serialize)
    expect(it.rawAttrs["top_direction"]).toBe("true");
    expect(it.rawAttrs["start_angle"]).toBe("-72");
    expect(it.rawAttrs["radius"]).toBe(String(it.radius));
  });

  it("negative amount arcs downward (top_direction false)", () => {
    const it = curved();
    setCurve(it, -50);
    expect(it.topDirection).toBe(false);
    expect(it.rawAttrs["top_direction"]).toBe("false");
  });

  it("amount 0 straightens the text (radius 0)", () => {
    const it = curved();
    setCurve(it, 0);
    expect(it.radius).toBe(0);
    expect(curveAmount(it)).toBe(0);
  });

  it("curveAmount reads back the sign of the stored curve", () => {
    const up = curved();
    setCurve(up, 60);
    expect(curveAmount(up)).toBeGreaterThan(0);
    const down = curved();
    setCurve(down, -60);
    expect(curveAmount(down)).toBeLessThan(0);
  });

  it("editing the curve changes only the curved item's serialized line", () => {
    const before = parse(XML);
    const after = parse(XML);
    setCurve(after.items[0] as TextCurvedItem, 90);
    const b = serialize(before).split("\n");
    const a = serialize(after).split("\n");
    expect(a.length).toBe(b.length);
    expect(a.filter((l, i) => l !== b[i]).length).toBe(1);
  });
});

describe("computeCrop — pure crop math", () => {
  it("maps a canvas-space crop rect to source pixels and new geometry", () => {
    const it = image(); // xpos 400, ypos 410, w 360, h 260 (natural 360x260)
    const r = computeCrop(it, { x: 270, y: 310, w: 200, h: 150 }, 360, 260);
    // boxLeft=220, boxTop=280 ; fx=fy=1
    expect(r.sx).toBe(50);
    expect(r.sy).toBe(30);
    expect(r.sw).toBe(200);
    expect(r.sh).toBe(150);
    expect(r.xpos).toBe(370);
    expect(r.ypos).toBe(385);
    expect(r.width).toBe(200);
    expect(r.height).toBe(150);
  });

  it("scales source pixels when natural size differs from the box", () => {
    const it = image();
    const r = computeCrop(it, { x: 220, y: 280, w: 180, h: 130 }, 720, 520); // 2x
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(0);
    expect(r.sw).toBe(360);
    expect(r.sh).toBe(260);
  });
});

describe("applyCrop — destructive bake (legacy semantics)", () => {
  it("swaps in the baked source, new geometry and marks cropped=true", () => {
    const it = image();
    applyCrop(it, "data:image/png;base64,ABC", { xpos: 370, ypos: 385, width: 200, height: 150 });
    expect(it.source).toBe("data:image/png;base64,ABC");
    expect(it.cropped).toBe(true);
    expect(it.width).toBe(200);
    expect(it.rawAttrs["source"]).toBe("data:image/png;base64,ABC");
    expect(it.rawAttrs["cropped"]).toBe("true");
    expect(it.rawAttrs["xpos"]).toBe("370");
  });

  it("keeps crop memory session-only (not serialized)", () => {
    const it = image() as ImageCropMemory;
    applyCrop(
      it,
      "data:image/png;base64,ABC",
      { xpos: 370, ypos: 385, width: 200, height: 150 },
      { _fullSource: "/sample-photo.png", _cropRect: { x: 50, y: 30, width: 200, height: 150 } }
    );
    const d = parse(XML);
    d.items[1] = it;
    const xml = serialize(d);
    expect(xml).not.toContain("_fullSource");
    expect(xml).not.toContain("_cropRect");
    expect(it._fullSource).toBe("/sample-photo.png");
    expect(structuredClone(it)._cropRect).toEqual({ x: 50, y: 30, width: 200, height: 150 });
  });
});

describe("session crop memory math", () => {
  it("successive crops compose into full-source coordinates", () => {
    const first = { x: 50, y: 30, width: 200, height: 150 };
    const second = composeCropRect(first, { sx: 20, sy: 10, sw: 100, sh: 80 }, 200, 150);
    expect(second).toEqual({ x: 70, y: 40, width: 100, height: 80 });
  });

  it("crop then expand restores the exact original rect", () => {
    const it = image() as ImageItem;
    const cropped = { ...it, xpos: 370, ypos: 385, width: 200, height: 150 };
    const current = { x: 50, y: 30, width: 200, height: 150 };
    const fullBounds = fullSourceCanvasBounds(cropped, current, 360, 260);
    expect(fullBounds).toEqual({ x: 220, y: 280, w: 360, h: 260 });
    const full = canvasRectToFullSourceRect(cropped, current, fullBounds, 360, 260);
    expect(full).toEqual({ x: 0, y: 0, width: 360, height: 260 });
    const geom = fullSourceRectToCanvasGeom(cropped, current, full);
    expect(geom).toEqual({ xpos: 400, ypos: 410, width: 360, height: 260 });
  });

  it("scale mapping remains correct after the item was resized after crop", () => {
    const cropped = { ...image(), xpos: 400, ypos: 410, width: 400, height: 300 } as ImageItem;
    const current = { x: 50, y: 30, width: 200, height: 150 };
    const visible = currentCropCanvasRect(cropped);
    const full = canvasRectToFullSourceRect(cropped, current, visible, 360, 260);
    expect(full).toEqual(current);
    const expandedWest = { ...visible, x: visible.x - 40, w: visible.w + 40 };
    const next = canvasRectToFullSourceRect(cropped, current, expandedWest, 360, 260);
    expect(next.x).toBeCloseTo(30);
    expect(next.width).toBeCloseTo(220);
    const geom = fullSourceRectToCanvasGeom(cropped, current, next);
    expect(geom.xpos).toBeCloseTo(380);
    expect(geom.width).toBeCloseTo(440);
  });
});
