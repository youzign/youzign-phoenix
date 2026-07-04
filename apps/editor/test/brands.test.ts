import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "@youzign/designstring";
import {
  collectDesignColors,
  createBrand,
  deleteBrand,
  getActiveBrand,
  getActiveBrandId,
  getBrand,
  listBrands,
  normalizeHex,
  onBrandsChanged,
  renameBrand,
  setActiveBrand,
  setBrandColors,
  setBrandFonts,
} from "../src/library/brands.js";

const LS_KEY = "youzign-next:brands";

function installLocalStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return values.size;
    },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
  });
  return values;
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("brand color normalization", () => {
  it("normalizes accepted hex formats", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("#A1B2C3")).toBe("#a1b2c3");
    expect(normalizeHex("A1B2C3")).toBe("#a1b2c3");
  });

  it("rejects invalid colors", () => {
    expect(normalizeHex("")).toBeNull();
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex("#abcd")).toBeNull();
    expect(normalizeHex("not-a-color")).toBeNull();
  });
});

describe("collectDesignColors", () => {
  it("collects canvas, text, clipart, borders, and nested group colors in order", () => {
    const design = parse(`
      <data canvas_width="800" canvas_height="600" bg_color="1122867" bg_type="color" border_width="2" border_color="4478310">
        <item type="text" index="0" xpos="100" ypos="100" width="0" height="0" rotation="0" opacity="1" color="16711680@@@16711680" is_border="true" border_size="3" border_color="65280"><![CDATA[Hi]]></item>
        <item type="clipart" index="1" xpos="200" ypos="200" width="100" height="100" rotation="0" opacity="1" color="255@@@16711680" />
        <item type="group" index="2" xpos="300" ypos="300" width="100" height="100" rotation="0" opacity="1">
          <item type="text" index="0" xpos="0" ypos="0" width="0" height="0" rotation="0" opacity="1" color="1193046"><![CDATA[Nested]]></item>
        </item>
      </data>
    `);

    expect(collectDesignColors(design)).toEqual([
      "#112233",
      "#445566",
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#123456",
    ]);
  });

  it("skips transparent/no-fill sentinels, dedupes, and caps at eight colors", () => {
    const design = parse(`
      <data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color" transparent="true">
        <item type="text" index="0" xpos="100" ypos="100" width="0" height="0" rotation="0" opacity="1" color="-1@@@16711680" isNoFill="true"><![CDATA[No fill]]></item>
        <item type="clipart" index="1" xpos="200" ypos="200" width="100" height="100" rotation="0" opacity="1" color="16711680@@@65280@@@255@@@1193046@@@6636321@@@1122867@@@4478310@@@7833753@@@10070715" />
        <item type="clipart" index="2" xpos="300" ypos="300" width="100" height="100" rotation="0" opacity="1" color="16711680" shape_fill="none" />
      </data>
    `);

    expect(collectDesignColors(design)).toEqual([
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#123456",
      "#654321",
      "#112233",
      "#445566",
      "#778899",
    ]);
  });
});

describe("brand storage", () => {
  it("round-trips CRUD operations", () => {
    const brand = createBrand({
      name: "  Acme  ",
      colors: ["#ABC", "junk", "abc", "112233"],
      fonts: { heading: "Inter" },
    });

    expect(listBrands()).toHaveLength(1);
    expect(getBrand(brand.id)).toMatchObject({
      name: "Acme",
      colors: ["#aabbcc", "#112233"],
      fonts: { heading: "Inter" },
    });

    renameBrand(brand.id, "Launch");
    setBrandColors(brand.id, ["fff", "#FFFFFF", "#000000", "nope"]);
    setBrandFonts(brand.id, { body: "Roboto" });
    setBrandFonts(brand.id, { heading: undefined });

    expect(getBrand(brand.id)).toMatchObject({
      name: "Launch",
      colors: ["#ffffff", "#000000"],
      fonts: { body: "Roboto" },
    });
  });

  it("makes the first brand active and preserves it when adding another", () => {
    const first = createBrand({ name: "First" });
    const second = createBrand({ name: "Second" });

    expect(getActiveBrandId()).toBe(first.id);
    expect(getActiveBrand()?.id).toBe(first.id);
    expect(second.id).not.toBe(first.id);
  });

  it("falls back to the first remaining brand when deleting the active one", () => {
    const first = createBrand({ name: "First" });
    const second = createBrand({ name: "Second" });
    const third = createBrand({ name: "Third" });

    setActiveBrand(second.id);
    deleteBrand(second.id);
    expect(getActiveBrandId()).toBe(first.id);

    deleteBrand(first.id);
    expect(getActiveBrandId()).toBe(third.id);

    deleteBrand(third.id);
    expect(getActiveBrandId()).toBeNull();
  });

  it("persists through localStorage and recovers stored data", () => {
    const store = installLocalStorage();
    store.set(
      LS_KEY,
      JSON.stringify({
        brands: [
          {
            id: "br_saved",
            name: "Saved",
            colors: ["ABCDEF"],
            fonts: { heading: "Inter", body: "Roboto" },
            createdAt: 123,
          },
        ],
        activeId: "br_saved",
      })
    );

    expect(listBrands()).toEqual([
      {
        id: "br_saved",
        name: "Saved",
        colors: ["#abcdef"],
        fonts: { heading: "Inter", body: "Roboto" },
        createdAt: 123,
      },
    ]);
    expect(getActiveBrandId()).toBe("br_saved");
  });

  it("drops invalid stored entries and clears an invalid active id", () => {
    const store = installLocalStorage();
    store.set(
      LS_KEY,
      JSON.stringify({
        brands: [
          { id: "bad", name: "Bad", colors: [], fonts: {}, createdAt: "now" },
          { id: "good", name: "Good", colors: ["123"], fonts: {}, createdAt: 1 },
        ],
        activeId: "missing",
      })
    );

    expect(listBrands().map((brand) => brand.id)).toEqual(["good"]);
    expect(getActiveBrandId()).toBeNull();
  });

  it("recovers from corrupt JSON", () => {
    const store = installLocalStorage();
    store.set(LS_KEY, "{not json");

    expect(listBrands()).toEqual([]);
    expect(getActiveBrandId()).toBeNull();
  });

  it("notifies listeners on mutations and supports unsubscribe", () => {
    let calls = 0;
    const unsubscribe = onBrandsChanged(() => calls++);

    const brand = createBrand({ name: "Brand" });
    renameBrand(brand.id, "Renamed");
    expect(calls).toBe(2);

    unsubscribe();
    setBrandColors(brand.id, ["fff"]);
    expect(calls).toBe(2);
  });
});
