import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
