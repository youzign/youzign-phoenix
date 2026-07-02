import { describe, expect, it } from "vitest";
import { parse, serialize, type Design } from "@youzign/designstring";
import { resizeDesign, setCanvasSize, CANVAS_PRESETS } from "../src/index.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

function design(
  w: number,
  h: number,
  items = ""
): Design {
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
    ...attrs,
  };
  const a = Object.entries(base)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  return `<item ${a}/>`;
}

describe("setCanvasSize", () => {
  it("changes only dims + dpi, syncing rawAttrs", () => {
    const d = design(800, 600, imageItem({ xpos: 100, ypos: 100, width: 50, height: 50 }));
    setCanvasSize(d, 1080, 1920, 300);
    expect(d.canvasWidth).toBe(1080);
    expect(d.canvasHeight).toBe(1920);
    expect(d.dpi).toBe(300);
    expect(d.rawAttrs.canvas_width).toBe("1080");
    expect(d.rawAttrs.canvas_height).toBe("1920");
    expect(d.rawAttrs.dpi).toBe("300");
    // item untouched
    const it = d.items[0] as any;
    expect(it.xpos).toBe(100);
    expect(it.width).toBe(50);
  });
});

describe("resizeDesign — scaleElements=false", () => {
  it("changes canvas but leaves every item absolute", () => {
    const d = design(800, 600, imageItem({ xpos: 400, ypos: 300, width: 200, height: 100 }));
    resizeDesign(d, 1600, 1200, { scaleElements: false });
    expect(d.canvasWidth).toBe(1600);
    expect(d.canvasHeight).toBe(1200);
    const it = d.items[0] as any;
    expect(it.xpos).toBe(400);
    expect(it.ypos).toBe(300);
    expect(it.width).toBe(200);
    expect(it.height).toBe(100);
  });
});

describe("resizeDesign — smart resize (scaleElements=true)", () => {
  it("uses the min scale factor so nothing crops", () => {
    // 800x600 -> 1600x600: sX=2, sY=1 => s=1 (min). Width axis has slack.
    const d = design(800, 600, imageItem({ xpos: 400, ypos: 300, width: 100, height: 100 }));
    resizeDesign(d, 1600, 600, { scaleElements: true });
    const it = d.items[0] as any;
    // s=1, offX=(1600-800)/2=400, offY=0
    expect(it.xpos).toBe(400 + 400);
    expect(it.ypos).toBe(300);
    expect(it.width).toBe(100);
    expect(it.height).toBe(100);
  });

  it("scales size + centres on the slack axis (portrait target)", () => {
    // 800x600 -> 1080x1920: sX=1.35, sY=3.2 => s=1.35. Height has slack.
    const d = design(800, 600, imageItem({ xpos: 400, ypos: 300, width: 200, height: 150 }));
    resizeDesign(d, 1080, 1920, { scaleElements: true });
    const s = 1.35;
    const offY = (1920 - 600 * s) / 2;
    const it = d.items[0] as any;
    expect(it.xpos).toBe(round2(400 * s + 0)); // offX = (1080-800*1.35)/2 = 0
    expect(it.ypos).toBe(round2(300 * s + offY));
    expect(it.width).toBe(round2(200 * s));
    expect(it.height).toBe(round2(150 * s));
    // a centred element stays centred
    expect(it.xpos).toBe(540);
    expect(it.ypos).toBe(960);
  });

  it("scales px-based effects (shadow / border / blur)", () => {
    const d = design(
      800,
      600,
      imageItem({
        xpos: 400,
        ypos: 300,
        width: 100,
        height: 100,
        is_shadow: "true",
        shadow_distance: 10,
        is_border: "true",
        border_size: 8,
        is_blur: "true",
        blur_size: 6,
      })
    );
    resizeDesign(d, 400, 300, { scaleElements: true }); // s=0.5
    const it = d.items[0] as any;
    expect(it.shadowDistance).toBe(5);
    expect(it.borderSize).toBe(4);
    expect(it.blurSize).toBe(3);
    expect(it.rawAttrs.shadow_distance).toBe("5");
    expect(it.rawAttrs.border_size).toBe("4");
    expect(it.rawAttrs.blur_size).toBe("3");
  });

  it("scales text font size + text-area metrics", () => {
    const text = `<item type="text" index="0" xpos="400" ypos="300" size="40" width="0" height="0" rotation="0" opacity="1" font="Arvo" fontType="External Font" color="0" alignment="center" scalex="1" scaley="1" wrapping="false" scaleUsed="true" textAreaWidth="200" textAreaHeight="60" mcWidth="200" mcHeight="60" textAreaxpos="-100" textAreaypos="-30" bold="false" italic="false" isNoFill="false" underline="false"><![CDATA[Hi]]></item>`;
    const d = design(800, 600, text);
    resizeDesign(d, 1600, 1200, { scaleElements: true }); // s=2
    const it = d.items[0] as any;
    expect(it.size).toBe(80);
    expect(it.textAreaWidth).toBe(400);
    expect(it.textAreaHeight).toBe(120);
    expect(it.mcWidth).toBe(400);
    expect(it.mcHeight).toBe(120);
    expect(it.textAreaxpos).toBe(-200);
    expect(it.textAreaypos).toBe(-60);
    // placement ratio mcWidth/textAreaWidth preserved (=1)
    expect(it.mcWidth / it.textAreaWidth).toBe(1);
    expect(it.rawAttrs.size).toBe("80");
  });

  it("scales curved-text radius but not its angles", () => {
    const curved = `<item type="text-curved" index="0" xpos="400" ypos="300" size="40" width="0" height="0" rotation="0" opacity="1" font="Arvo" fontType="External Font" color="0" alignment="center" scalex="1" scaley="1" wrapping="false" scaleUsed="true" textAreaWidth="200" textAreaHeight="60" mcWidth="200" mcHeight="60" textAreaxpos="-100" textAreaypos="-30" bold="false" italic="false" isNoFill="false" underline="false" start_angle="-45" end_angle="45" radius="100" top_direction="true" use_letter_angle="false"><![CDATA[Arc]]></item>`;
    const d = design(800, 600, curved);
    resizeDesign(d, 1600, 1200, { scaleElements: true }); // s=2
    const it = d.items[0] as any;
    expect(it.radius).toBe(200);
    expect(it.startAngle).toBe(-45);
    expect(it.endAngle).toBe(45);
    expect(it.rawAttrs.radius).toBe("200");
    expect(it.rawAttrs.start_angle).toBe("-45");
  });

  it("scales groups via scaleX/scaleY, leaving children group-local", () => {
    const group = `<item type="group" index="0" xpos="400" ypos="300" width="100" height="100" rotation="0" opacity="1" scaleX="1" scaleY="1"><item type="image" index="0" xpos="10" ypos="10" width="20" height="20" rotation="0" opacity="1" source="x"/></item>`;
    const d = design(800, 600, group);
    resizeDesign(d, 1600, 1200, { scaleElements: true }); // s=2
    const g = d.items[0] as any;
    expect(g.scaleX).toBe(2);
    expect(g.scaleY).toBe(2);
    expect(g.xpos).toBe(800);
    expect(g.width).toBe(200);
    // child untouched (rides the group scale)
    const child = g.items[0];
    expect(child.xpos).toBe(10);
    expect(child.width).toBe(20);
    expect(g.rawAttrs.scaleX).toBe("2");
  });

  it("rounds to 2 decimals and round-trips to valid XML", () => {
    const d = design(1000, 1000, imageItem({ xpos: 333, ypos: 333, width: 111, height: 111, source: "x" }));
    resizeDesign(d, 1080, 1080, { scaleElements: true }); // s=1.08
    const it = d.items[0] as any;
    expect(it.xpos).toBe(round2(333 * 1.08));
    // no field has > 2 decimals
    for (const v of [it.xpos, it.ypos, it.width, it.height]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.round(v * 100)).toBe(v * 100);
    }
    // serialize -> parse round-trips
    const xml = serialize(d);
    const re = parse(xml);
    expect(re.canvasWidth).toBe(1080);
    expect((re.items[0] as any).xpos).toBe(it.xpos);
  });

  it("is a no-op scale when old dims are zero (defensive)", () => {
    const d = design(0, 0, imageItem({ xpos: 5, ypos: 5, width: 5, height: 5, source: "x" }));
    resizeDesign(d, 800, 600, { scaleElements: true });
    expect(d.canvasWidth).toBe(800);
    const it = d.items[0] as any;
    expect(it.xpos).toBe(5); // untouched, no divide-by-zero
  });
});

describe("CANVAS_PRESETS catalog", () => {
  it("has modern grouped presets with sane dims and no dead platforms", () => {
    expect(CANVAS_PRESETS.length).toBeGreaterThan(25);
    for (const p of CANVAS_PRESETS) {
      expect(p.width).toBeGreaterThanOrEqual(32);
      expect(p.width).toBeLessThanOrEqual(8000);
      expect(p.height).toBeGreaterThanOrEqual(32);
      expect(p.height).toBeLessThanOrEqual(8000);
      expect(["Social", "Video", "Print", "Web"]).toContain(p.category);
    }
    // dead platforms gone
    const names = CANVAS_PRESETS.map((p) => p.name.toLowerCase()).join(" ");
    expect(names).not.toContain("google+");
    expect(names).not.toContain("mockzign");
    // current specs present
    const ig = CANVAS_PRESETS.find((p) => p.id === "ig-story");
    expect(ig).toMatchObject({ width: 1080, height: 1920 });
    const yt = CANVAS_PRESETS.find((p) => p.id === "yt-thumbnail");
    expect(yt).toMatchObject({ width: 1280, height: 720 });
    const a4 = CANVAS_PRESETS.find((p) => p.id === "print-a4");
    expect(a4).toMatchObject({ width: 2480, height: 3508, dpi: 300 });
  });
});
