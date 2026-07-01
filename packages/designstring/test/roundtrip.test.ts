import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse, serialize } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(__dirname, "../../../apps/editor/src/fixtures");

const fixtures = ["mountains-input.xml", "mountains-output.xml"];

describe("round-trip parse/serialize", () => {
  for (const name of fixtures) {
    const xml = readFileSync(resolve(fixtureDir, name), "utf8");

    it(`${name}: parse(serialize(parse(xml))) deep-equals parse(xml)`, () => {
      const once = parse(xml);
      const twice = parse(serialize(once));
      expect(twice).toEqual(once);
    });

    it(`${name}: serialize is string-stable across two round-trips`, () => {
      const s1 = serialize(parse(xml));
      const s2 = serialize(parse(s1));
      expect(s2).toBe(s1);
    });

    it(`${name}: parses the expected structure`, () => {
      const d = parse(xml);
      expect(d.bgType).toBe("color");
      expect(d.bgColor).toBe(16513009);
      expect(d.canvasWidth).toBe(1200);
      expect(d.canvasHeight).toBe(1002);
      // image, 4 text, group, filter
      const types = d.items.map((i) => i.type);
      expect(types).toEqual(["image", "text", "text", "text", "text", "group", "filter"]);
      const group = d.items.find((i) => i.type === "group") as any;
      expect(group.items).toHaveLength(4);
      expect(group.items.every((c: any) => c.type === "clipart")).toBe(true);
    });
  }
});

describe("forward-compat: unknown attributes survive", () => {
  const xml = readFileSync(resolve(fixtureDir, "mountains-input.xml"), "utf8");

  it("injected unknown attrs on <data> and an <item> round-trip", () => {
    const injected = xml
      .replace("<data ", '<data made_up_canvas_attr="hello" ')
      .replace('type="image"', 'type="image" future_flag="42"');
    const design = parse(injected);
    expect(design.extraAttrs.made_up_canvas_attr).toBe("hello");
    const img = design.items[0] as any;
    expect(img.extraAttrs.future_flag).toBe("42");
    const re = parse(serialize(design));
    expect(re.extraAttrs.made_up_canvas_attr).toBe("hello");
    expect((re.items[0] as any).extraAttrs.future_flag).toBe("42");
    expect(re).toEqual(design);
  });
});

describe("per-glyph text color", () => {
  const xml = readFileSync(resolve(fixtureDir, "mountains-input.xml"), "utf8");
  it("parses one color token per char", () => {
    const d = parse(xml);
    const t = d.items.find((i) => i.type === "text") as any;
    expect(t.colors.length).toBe(t.content.length);
    expect(t.colors[0]).toBe(3289650);
  });
});
