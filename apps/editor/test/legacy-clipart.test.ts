import { describe, expect, it } from "vitest";
import { parse } from "@youzign/designstring";
import {
  remapLegacyClipartInDesign,
  resolveLegacyClipartFile,
  rewriteLegacyClipartSources,
} from "../src/library/legacyClipart.js";
import { documentFromXml } from "../src/document.js";

const id = (file: string) => file; // pass-through resolver for assertions

function clipartXml(source: string, sourceSvg = ""): string {
  return (
    `<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color">` +
    `<item type="clipart" index="0" source="${source}" source_svg="${sourceSvg}" ` +
    `color="-6132097" xpos="0" ypos="0" width="100" height="100"></item>` +
    `</data>`
  );
}

describe("resolveLegacyClipartFile", () => {
  it("maps a relative built-in .swf source to its bundled SVG filename", () => {
    expect(resolveLegacyClipartFile("assets/graphics/shapes/shapes_square.swf")).toBe("shapes_square.svg");
    expect(resolveLegacyClipartFile("assets/graphics/academic/flat/academic_sports_light_bulb.swf")).toBe(
      "academic_sports_light_bulb.svg"
    );
  });

  it("handles the ../editors/ path prefix seen in the real corpus", () => {
    expect(resolveLegacyClipartFile("../editors/assets/graphics/icons/icon_subtract.swf")).toBe(
      "icon_subtract.svg"
    );
    expect(resolveLegacyClipartFile("../editors/assets/graphics/shapes/shapes_square.swf")).toBe(
      "shapes_square.svg"
    );
  });

  it("is case-insensitive on the basename and tolerates query/hash", () => {
    expect(resolveLegacyClipartFile("assets/graphics/shapes/SHAPES_SQUARE.swf?x=1")).toBe("shapes_square.svg");
  });

  it("returns null for unmatched .swf names (kept as current behavior)", () => {
    expect(resolveLegacyClipartFile("assets/graphics/circle.swf")).toBeNull();
    expect(resolveLegacyClipartFile("assets/graphics/star.swf")).toBeNull();
  });

  it("resolves the S3/B2-hosted copy by stripping the 13-char uniqid prefix", () => {
    // The 2015-era offloaded form: `<13-hex uniqid><built-in name>.swf`.
    expect(
      resolveLegacyClipartFile(
        "https://s3.amazonaws.com/userdata.youzign.com/wp-content/uploads/x/2015/11/5644db5ca0655icon_phone.swf"
      )
    ).toBe("icon_phone.svg");
    expect(resolveLegacyClipartFile("//host/x/56450536c8945shape_circle.swf?Authorization=tok")).toBe(
      "shape_circle.svg"
    );
  });

  it("ignores data URLs and unknown / user-uploaded .swf names", () => {
    expect(resolveLegacyClipartFile("data:image/svg+xml;base64,abc")).toBeNull();
    expect(resolveLegacyClipartFile("assets/graphics/shapes/shapes_square.png")).toBeNull();
    // A .swf whose name isn't a known built-in (e.g. a user upload) is untouched.
    expect(resolveLegacyClipartFile("https://s3/foo/my-custom-banner.swf")).toBeNull();
    expect(resolveLegacyClipartFile("assets/graphics/circle.swf")).toBeNull();
  });
});

describe("remapLegacyClipartInDesign", () => {
  it("rewrites a matched .swf clipart source to the bundled SVG url via the resolver", () => {
    const design = parse(clipartXml("assets/graphics/shapes/shapes_square.swf"));
    const out = remapLegacyClipartInDesign(design, id);
    expect((out.items[0] as any).source).toBe("/legacy-clipart/shapes_square.svg");
  });

  it("leaves an unmatched .swf source untouched (no-op reference)", () => {
    const design = parse(clipartXml("assets/graphics/circle.swf"));
    const out = remapLegacyClipartInDesign(design, id);
    expect(out).toBe(design);
    expect((out.items[0] as any).source).toBe("assets/graphics/circle.swf");
  });

  it("does not override an item that already has a sourceSvg", () => {
    const design = parse(
      clipartXml("assets/graphics/shapes/shapes_square.swf", "https://cdn/existing.svg")
    );
    const out = remapLegacyClipartInDesign(design, id);
    expect(out).toBe(design);
  });

  it("rewrites cliparts inside nested groups", () => {
    const design = parse(
      `<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color">` +
        `<item type="group" index="0" isSavedInLib="false" scaleX="1" scaleY="1">` +
        `<item type="clipart" index="0" source="assets/graphics/shapes/shapes_square.swf" source_svg="" color="-6132097" width="50" height="50"></item>` +
        `</item>` +
        `</data>`
    );
    const out = remapLegacyClipartInDesign(design, id);
    expect(((out.items[0] as any).items[0] as any).source).toBe("/legacy-clipart/shapes_square.svg");
  });

  it("is wired into the document open path (documentFromXml)", () => {
    const doc = documentFromXml(clipartXml("assets/graphics/shapes/shapes_square.swf"));
    // asset() prefixes with the app base (default "/"), so the source becomes a
    // bundled /legacy-clipart/*.svg URL the renderer's SVG path can fetch.
    expect((doc.pages[0].design.items[0] as any).source).toMatch(/\/legacy-clipart\/shapes_square\.svg$/);
  });
});

describe("rewriteLegacyClipartSources (import-time XML pass)", () => {
  const id = (file: string) => file;

  it("rewrites relative and S3/B2-hosted built-in .swf source attributes", () => {
    const xml =
      `<item type="clipart" source="../editors/assets/graphics/icons/icon_subtract.swf" color="200315"/>` +
      `<item type="clipart" source='https://s3.amazonaws.com/userdata.youzign.com/wp-content/uploads/x/2015/11/5644db5ca0655icon_phone.swf' color="1"/>`;
    const out = rewriteLegacyClipartSources(xml, id);
    expect(out).toContain('source="/legacy-clipart/icon_subtract.svg"');
    expect(out).toContain("source='/legacy-clipart/icon_phone.svg'");
  });

  it("leaves non-built-in and non-.swf sources untouched", () => {
    const xml =
      `<item type="image" source="https://cdn/photo.png"/>` +
      `<item type="clipart" source="https://cdn/my-upload.swf"/>`;
    expect(rewriteLegacyClipartSources(xml, id)).toBe(xml);
  });
});
