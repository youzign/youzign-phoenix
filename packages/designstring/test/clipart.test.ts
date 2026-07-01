import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse, serialize, signedIntToHex } from "../src/index.js";
import type { ClipartItem } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(__dirname, "../../../apps/editor/src/fixtures");

describe("clipart parsing", () => {
  const xml = readFileSync(resolve(fixtureDir, "clipart-local.xml"), "utf8");
  const design = parse(xml);
  const cliparts = design.items.filter(
    (i): i is ClipartItem => i.type === "clipart"
  );

  it("parses all five clipart items", () => {
    expect(cliparts).toHaveLength(5);
    expect(cliparts.every((c) => c.type === "clipart")).toBe(true);
  });

  it("parses source_svg into sourceSvg", () => {
    expect(cliparts[0].sourceSvg).toBe("/clipart/triangle.svg");
  });

  it("parses a single color into a one-element signed-int array", () => {
    expect(cliparts[0].colors).toEqual([14826299]);
    expect(signedIntToHex(cliparts[0].colors[0])).toBe("#e23b3b");
  });

  it("splits @@@ multi-color into an ordered signed-int array (per-layer recolor)", () => {
    const duo = cliparts[3];
    expect(duo.colors).toEqual([3890139, 14037868]);
    expect(duo.colors.map(signedIntToHex)).toEqual(["#3b5bdb", "#d6336c"]);
  });

  it("round-trips clipart items string-stably", () => {
    const s1 = serialize(parse(xml));
    const s2 = serialize(parse(s1));
    expect(s2).toBe(s1);
  });
});
