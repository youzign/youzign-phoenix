import { describe, expect, it, vi } from "vitest";
import { parse } from "@youzign/designstring";
import {
  collectFontNames,
  collectSelfHostFonts,
  legacyDesignFontFamilies,
  remapLegacyFontsInDesign,
  resolveLegacyFont,
  resolveSelfHostFont,
} from "../src/library/legacyFonts.js";
import { documentFromXml, parseAutosave } from "../src/document.js";
import { editorDocumentFromRecord } from "../src/library/documents.js";

function textXml(font: string, fontType = "External Font"): string {
  return `<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color"><item type="text" index="0" font="${font}" fontType="${fontType}" size="40" xpos="0" ypos="0" width="200" height="60"><![CDATA[Hello]]></item></data>`;
}

describe("resolveLegacyFont", () => {
  it("maps known collapsed-CamelCase legacy names to their real Google family", () => {
    expect(resolveLegacyFont("BebasNeue")).toBe("Bebas Neue");
    expect(resolveLegacyFont("FrederickatheGreat")).toBe("Fredericka the Great");
    expect(resolveLegacyFont("YanoneKaffeesatz")).toBe("Yanone Kaffeesatz");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(resolveLegacyFont("bebasneue")).toBe("Bebas Neue");
    expect(resolveLegacyFont("  Bebas   Neue  ")).toBe("Bebas Neue");
  });

  it("returns null for unmapped legacy names (no Google Fonts equivalent)", () => {
    expect(resolveLegacyFont("Coolvetica")).toBeNull();
    expect(resolveLegacyFont("SteinemRoman")).toBeNull();
    expect(resolveLegacyFont("Cooper")).toBeNull();
    expect(resolveLegacyFont("")).toBeNull();
  });
});

describe("resolveSelfHostFont", () => {
  it("resolves formerly-unmappable legacy names to a bundled woff2 file", () => {
    expect(resolveSelfHostFont("Coolvetica")).toEqual({ family: "Coolvetica", file: "coolvetica.woff2" });
    expect(resolveSelfHostFont("SteinemRoman")).toEqual({ family: "SteinemRoman", file: "steinemroman.woff2" });
    expect(resolveSelfHostFont("ChunkFive")).toEqual({ family: "ChunkFive", file: "chunkfive.woff2" });
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(resolveSelfHostFont("coolvetica")).toEqual({ family: "Coolvetica", file: "coolvetica.woff2" });
    expect(resolveSelfHostFont("  chunkfive  ")).toEqual({ family: "ChunkFive", file: "chunkfive.woff2" });
  });

  it("returns null for names with no bundled file", () => {
    expect(resolveSelfHostFont("BebasNeue")).toBeNull();
    expect(resolveSelfHostFont("")).toBeNull();
  });
});

describe("self-host fonts in remap + collection", () => {
  it("rewrites a self-hosted legacy name to its canonical family", () => {
    const design = parse(textXml("coolvetica"));
    const remapped = remapLegacyFontsInDesign(design);
    expect((remapped.items[0] as any).font).toBe("Coolvetica");
  });

  it("leaves an already-canonical self-host name untouched (no-op)", () => {
    const design = parse(textXml("Coolvetica"));
    const remapped = remapLegacyFontsInDesign(design);
    expect(remapLegacyFontsInDesign(remapped)).toBe(remapped);
    expect((remapped.items[0] as any).font).toBe("Coolvetica");
  });

  it("collects the distinct self-hosted fonts a design references", () => {
    const design = parse(
      `<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color">` +
        `<item type="text" index="0" font="Coolvetica" fontType="External Font" size="10"><![CDATA[a]]></item>` +
        `<item type="text" index="1" font="ChunkFive" fontType="External Font" size="10"><![CDATA[b]]></item>` +
        `<item type="text" index="2" font="BebasNeue" fontType="External Font" size="10"><![CDATA[c]]></item>` +
        `</data>`
    );
    const fonts = collectSelfHostFonts(design.items).sort((a, b) => a.family.localeCompare(b.family));
    expect(fonts).toEqual([
      { family: "ChunkFive", file: "chunkfive.woff2" },
      { family: "Coolvetica", file: "coolvetica.woff2" },
    ]);
  });
});

describe("collectFontNames", () => {
  it("collects font names from text and text-curved items, including nested groups", () => {
    const design = parse(
      `<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color">` +
        `<item type="text" index="0" font="BebasNeue" fontType="External Font" size="10"><![CDATA[a]]></item>` +
        `<item type="group" index="1" isSavedInLib="false" scaleX="1" scaleY="1">` +
        `<item type="text" index="0" font="Coolvetica" fontType="External Font" size="10"><![CDATA[b]]></item>` +
        `</item>` +
        `</data>`
    );
    const names = collectFontNames(design.items);
    expect([...names].sort()).toEqual(["BebasNeue", "Coolvetica"]);
  });
});

describe("remapLegacyFontsInDesign", () => {
  it("rewrites a mapped legacy font name onto the item, preserving other fields", () => {
    const design = parse(textXml("FrederickatheGreat"));
    const remapped = remapLegacyFontsInDesign(design);
    const item = remapped.items[0] as any;
    expect(item.font).toBe("Fredericka the Great");
    expect(item.size).toBe(40);
    expect(item.fontType).toBe("External Font");
  });

  it("leaves unmapped legacy names untouched (current fallback, no crash)", () => {
    const design = parse(textXml("Coolvetica"));
    const remapped = remapLegacyFontsInDesign(design);
    expect((remapped.items[0] as any).font).toBe("Coolvetica");
  });

  it("is a no-op (returns the same design reference) when nothing needs remapping", () => {
    const design = parse(textXml("Coolvetica"));
    const remapped = remapLegacyFontsInDesign(design);
    expect(remapLegacyFontsInDesign(remapped)).toBe(remapped);
  });

  it("remaps fonts inside nested groups", () => {
    const design = parse(
      `<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color">` +
        `<item type="group" index="0" isSavedInLib="false" scaleX="1" scaleY="1">` +
        `<item type="text" index="0" font="BebasNeue" fontType="External Font" size="10"><![CDATA[a]]></item>` +
        `</item>` +
        `</data>`
    );
    const remapped = remapLegacyFontsInDesign(design);
    const group = remapped.items[0] as any;
    expect(group.items[0].font).toBe("Bebas Neue");
  });

  it("logs unmapped legacy font names once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const uniqueName = `TotallyMadeUpLegacyFont${Date.now()}`;
    const design = parse(textXml(uniqueName));
    remapLegacyFontsInDesign(design);
    remapLegacyFontsInDesign(parse(textXml(uniqueName)));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("legacyDesignFontFamilies", () => {
  it("returns the distinct font families used by a design", () => {
    const design = parse(textXml("BebasNeue"));
    expect(legacyDesignFontFamilies(remapLegacyFontsInDesign(design))).toEqual(["Bebas Neue"]);
  });
});

describe("wiring into document open paths", () => {
  it("remaps legacy fonts when parsing raw XML (documentFromXml)", () => {
    const doc = documentFromXml(textXml("BebasNeue"));
    expect((doc.pages[0].design.items[0] as any).font).toBe("Bebas Neue");
  });

  it("remaps legacy fonts when restoring an autosave", () => {
    const doc = parseAutosave(textXml("YanoneKaffeesatz"));
    expect((doc.pages[0].design.items[0] as any).font).toBe("Yanone Kaffeesatz");
  });

  it("remaps legacy fonts when opening a persisted document record", () => {
    const doc = editorDocumentFromRecord({
      pages: [textXml("FrederickatheGreat")],
      titles: [""],
      activePage: 0,
    });
    expect((doc.pages[0].design.items[0] as any).font).toBe("Fredericka the Great");
  });
});
