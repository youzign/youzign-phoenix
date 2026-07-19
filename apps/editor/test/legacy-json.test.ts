import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, signedIntToHex } from "@youzign/designstring";
import { convertLegacyJsonDesign } from "../src/library/legacyJson.js";

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, "../src/fixtures", name), "utf8");

const GRADIENT = fixture("legacy-json-gradient.json");
const FLIP = fixture("legacy-json-flip.json");
const ALL_TYPES = fixture("legacy-json-all-types.json");

describe("convertLegacyJsonDesign", () => {
  it("produces XML that packages/designstring can parse", () => {
    for (const json of [GRADIENT, FLIP, ALL_TYPES]) {
      const xml = convertLegacyJsonDesign(json);
      expect(() => parse(xml)).not.toThrow();
      const design = parse(xml);
      expect(design.items.length).toBeGreaterThan(0);
    }
  });

  it("maps canvas fields, converts hex colors to signed ints and gradcolor→gradient", () => {
    const design = parse(convertLegacyJsonDesign(GRADIENT));
    expect(design.canvasWidth).toBe(599);
    expect(design.canvasHeight).toBe(398);
    expect(design.bgType).toBe("gradient"); // JSON "gradcolor"
    expect(design.transparent).toBe(false);
    // grad1 "#ff0101" round-trips through the signed-int color space
    expect(signedIntToHex(design.grad1)).toBe("#ff0101");
    expect(signedIntToHex(design.grad2)).toBe("#cb69e4");
  });

  it("preserves image + clipart source URLs verbatim", () => {
    const design = parse(convertLegacyJsonDesign(GRADIENT));
    const sources = design.items.map((i) => (i as any).source).filter(Boolean);
    expect(sources).toContain(
      "https://s3.amazonaws.com/userdata.youzign.com/wp-content/uploads/x/2018/04/youzign-logo-text-white-bW8VdQ.png"
    );
    expect(sources).toContain(
      "https://youzign.com/wp-content/uploads/2020/12/shape_circle-G6zn5F.svg"
    );
  });

  it("carries text content (incl. non-ASCII) and single-color glyphs", () => {
    const design = parse(convertLegacyJsonDesign(FLIP));
    const texts = design.items.filter((i) => i.type === "text") as any[];
    const contents = texts.map((t) => t.content);
    expect(contents).toContain("Réseautage");
    // text color is emitted as a single signed-int glyph token
    const withColor = texts.find((t) => t.colors.length > 0)!;
    expect(withColor.colors.length).toBe(1);
  });

  it("preserves item flips and stacking order (sorted by index)", () => {
    const design = parse(convertLegacyJsonDesign(FLIP));
    const indices = design.items.map((i) => i.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    const flipped = design.items.find((i) => i.hFlip || i.vFlip);
    expect(flipped).toBeDefined();
    expect(flipped!.hFlip).toBe(true);
  });

  it("maps shadows: enabled flag, distance/angle/opacity and hex→int color", () => {
    const design = parse(convertLegacyJsonDesign(ALL_TYPES));
    const shadowed = design.items.find((i) => (i as any).isShadow) as any;
    expect(shadowed).toBeDefined();
    expect(shadowed.isShadow).toBe(true);
    expect(shadowed.shadowDistance).toBe(5);
    expect(shadowed.shadowAngle).toBe(45);
    expect(shadowed.shadowOpacity).toBeCloseTo(0.45);
    expect(signedIntToHex(shadowed.shadowColor)).toBe("#000000");
  });

  it("converts clipart color objects/arrays into @@@ per-token strings", () => {
    // {"0":"#f79219"} or ["#f79219"] both become one signed-int token
    const design = parse(convertLegacyJsonDesign(GRADIENT));
    const clipart = design.items.find((i) => i.type === "clipart") as any;
    expect(clipart).toBeDefined();
    expect(clipart.colors.length).toBeGreaterThan(0);
    expect(signedIntToHex(clipart.colors[0])).toBe("#f79219");
  });

  it("escapes XML-special characters in attributes and CDATA", () => {
    const json = JSON.stringify({
      canvasData: { templateType: "a & b <c>", width: 100, height: 100, bgType: "color", bgColor: "#ffffff" },
      pageItems: [
        {
          type: "text",
          index: 0,
          content: "5 < 6 & 7 ]]> done",
          color: "#000000",
          xpos: 10,
          ypos: 10,
          font: 'My"Font',
        },
      ],
    });
    const xml = convertLegacyJsonDesign(json);
    expect(() => parse(xml)).not.toThrow();
    const design = parse(xml);
    expect(design.templateType).toBe("a & b <c>");
    expect((design.items[0] as any).content).toBe("5 < 6 & 7 ]]> done");
    expect((design.items[0] as any).font).toBe('My"Font');
  });

  describe("matrix geometry (darkknight — stale xpos/ypos/mcWidth, real transform in matrix)", () => {
    // Raw payload facts: canvas 1130x1500.
    //  image: width=1138 height=1492 (LOCAL, pre-matrix), matrix a=d=1.0053619,
    //         x=-6.7264574, y=0; stored xpos/ypos = 0 (stale).
    //  text "Dark Knight": size=110 taW=640.555 taH=135, matrix a=d=0.95176409,
    //         x=263.9557, y=98.6547; stored mcWidth=930 (garbage: 930/640.555
    //         = 1.452 ≠ 0.9518), stored xpos/ypos/textAreaxpos = 0 (stale).
    const design = parse(convertLegacyJsonDesign(fixture("legacy-json-darkknight.json")));

    it("derives image on-canvas size and center from the matrix (full-bleed cover)", () => {
      const img = design.items.find((i) => i.type === "image") as any;
      // final = local × matrix scale: 1138×1.0053619 ≈ 1144.1, 1492×1.0053619 = 1500.0
      expect(img.width).toBeCloseTo(1144.102, 2);
      expect(img.height).toBeCloseTo(1500.0, 2);
      // center = matrix·(w/2,h/2) + translate = (565.32, 750.0) — covers the canvas
      expect(img.xpos).toBeCloseTo(565.324, 2);
      expect(img.ypos).toBeCloseTo(750.0, 2);
      expect(img.rotation).toBeCloseTo(0, 5);
    });

    it("expresses the matrix text scale via mcWidth/mcHeight (ignoring the stale stored mcWidth)", () => {
      const title = design.items.find((i) => (i as any).content === "Dark Knight") as any;
      // sx = 0.95176409...; mcWidth = sx·taW = 609.657, mcHeight = sx·taH = 128.488
      expect(title.mcWidth).toBeCloseTo(609.657, 2);
      expect(title.mcHeight).toBeCloseTo(128.488, 2);
      // renderer scale = mcWidth/textAreaWidth must equal the matrix scale
      expect(title.mcWidth / title.textAreaWidth).toBeCloseTo(0.9517640944865016, 6);
    });

    it("anchors text so the rendered top-left equals the matrix translate", () => {
      const title = design.items.find((i) => (i as any).content === "Dark Knight") as any;
      const sx = title.mcWidth / title.textAreaWidth;
      const sy = title.mcHeight / title.textAreaHeight;
      // xpos = m.x + sx·taW/2 = 568.784; taxpos = −taW/2
      expect(title.xpos).toBeCloseTo(568.784, 2);
      expect(title.textAreaxpos).toBeCloseTo(-320.2775, 3);
      // left/top as computed by textPlacement (renderer) and the selection box
      expect(title.xpos + title.textAreaxpos * sx).toBeCloseTo(263.9557, 2);
      expect(title.ypos + title.textAreaypos * sy).toBeCloseTo(98.6547, 2);
    });

    it("places the byline near the bottom, horizontally centered", () => {
      const byline = design.items.find((i) => (i as any).content === "John Doe") as any;
      expect(byline.xpos).toBeCloseTo(567.248, 2); // canvas center 565
      expect(byline.ypos).toBeCloseTo(1383.07, 2); // near bottom of 1500
      expect(byline.mcWidth).toBeCloseTo(251.087, 2);
    });
  });

  describe("QA regressions (real customer payloads)", () => {
    it("combolock: image WIDER than the canvas keeps its exact oversized geometry (13626898)", () => {
      // canvas 1027x1536; image local 960x540, matrix a=d=3.0021257, x=-934.0985, y=-48.1028.
      // Full-bleed cover: 960·3.0021257=2882.04 wide (2.8× the canvas), 540·3.0021257=1621.15.
      const design = parse(convertLegacyJsonDesign(fixture("legacy-json-combolock.json")));
      expect(design.canvasWidth).toBe(1027);
      expect(design.canvasHeight).toBe(1536);
      const img = design.items.find((i) => i.type === "image") as any;
      expect(img.width).toBeCloseTo(2882.0407, 3);
      expect(img.height).toBeCloseTo(1621.1479, 3);
      expect(img.xpos).toBeCloseTo(506.9218, 3);
      expect(img.ypos).toBeCloseTo(762.4712, 3);
      // left edge = xpos − width/2 = matrix.x (negative: image is cropped by the canvas)
      expect(img.xpos - img.width / 2).toBeCloseTo(-934.0985, 3);
      // The sliver bug was Tailwind preflight (img{max-width:100%}) clamping the
      // rendered width to the canvas — exempted via .yz-canvas img in index.css.
    });

    it("inform: canvas dimensions survive conversion exactly (13406389)", () => {
      const design = parse(convertLegacyJsonDesign(fixture("legacy-json-inform.json")));
      expect(design.canvasWidth).toBe(1000);
      expect(design.canvasHeight).toBe(1000);
      const clip = design.items.find((i) => i.type === "clipart") as any;
      // local 256x256 × matrix scale 1.5209341 = 389.359 at center (500.60, 482.47)
      expect(clip.width).toBeCloseTo(389.3591, 3);
      expect(clip.height).toBeCloseTo(389.3591, 3);
      expect(clip.xpos).toBeCloseTo(500.6046, 3);
      expect(clip.ypos).toBeCloseTo(482.4667, 3);
    });
  });

  it("derives rotation from the matrix when the rotation field is absent/zero", () => {
    const json = JSON.stringify({
      canvasData: { templateType: "t", width: 100, height: 100, bgType: "color", bgColor: "#ffffff" },
      pageItems: [
        {
          type: "clipart",
          index: 0,
          source: "https://example.com/x.svg",
          colors: { "0": "#ff0000" },
          width: 100,
          height: 50,
          rotation: 0,
          // 30° rotation with uniform scale 2: a=2cos30, b=2sin30, c=-2sin30, d=2cos30
          matrix: { a: 1.7320508, b: 1, c: -1, d: 1.7320508, x: 10, y: 20 },
        },
      ],
    });
    const design = parse(convertLegacyJsonDesign(json));
    const item = design.items[0] as any;
    expect(item.rotation).toBeCloseTo(30, 4);
    expect(item.width).toBeCloseTo(200, 3); // 100 × scale 2
    expect(item.height).toBeCloseTo(100, 3); // 50 × scale 2
    // center = M·(50,25) + (10,20) = (10+86.6-25, 20+50+43.3) = (71.6, 113.3)
    expect(item.xpos).toBeCloseTo(10 + 1.7320508 * 50 - 1 * 25, 3);
    expect(item.ypos).toBeCloseTo(20 + 1 * 50 + 1.7320508 * 25, 3);
  });

  it("falls back to stored fields when an item has no matrix", () => {
    const json = JSON.stringify({
      canvasData: { templateType: "t", width: 100, height: 100, bgType: "color", bgColor: "#ffffff" },
      pageItems: [
        { type: "image", index: 0, source: "https://example.com/a.png", xpos: 40, ypos: 30, width: 20, height: 10, rotation: 5 },
      ],
    });
    const item = parse(convertLegacyJsonDesign(json)).items[0] as any;
    expect(item.xpos).toBe(40);
    expect(item.width).toBe(20);
    expect(item.rotation).toBe(5);
  });

  it("throws on non-JSON / shapes without canvasData", () => {
    expect(() => convertLegacyJsonDesign("<data></data>")).toThrow();
    expect(() => convertLegacyJsonDesign(JSON.stringify({ pageItems: [] }))).toThrow();
  });
});
