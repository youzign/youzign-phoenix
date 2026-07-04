import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCustomFont,
  listCustomFonts,
  onCustomFontsChanged,
  removeCustomFont,
} from "../src/library/custom-fonts.js";

const LS_KEY = "youzign-next:custom-fonts";

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

describe("custom Google Fonts storage", () => {
  it("stores trimmed unique family names in sorted order", () => {
    addCustomFont("  Grandstander  ");
    addCustomFont("Inter");
    addCustomFont("Grandstander");
    addCustomFont("   ");

    expect(listCustomFonts()).toEqual(["Grandstander", "Inter"]);
    expect(JSON.parse(localStorage.getItem(LS_KEY) || "[]")).toEqual(["Grandstander", "Inter"]);
  });

  it("removes a stored family", () => {
    addCustomFont("Grandstander");
    addCustomFont("Inter");

    removeCustomFont(" Grandstander ");

    expect(listCustomFonts()).toEqual(["Inter"]);
  });

  it("recovers from corrupt or invalid stored data", () => {
    const store = installLocalStorage();
    store.set(LS_KEY, "{not json");
    expect(listCustomFonts()).toEqual([]);

    store.set(LS_KEY, JSON.stringify([" Inter ", 12, "", "Inter"]));
    expect(listCustomFonts()).toEqual(["Inter"]);
  });

  it("notifies listeners for add and remove and supports unsubscribe", () => {
    let calls = 0;
    const unsubscribe = onCustomFontsChanged(() => calls++);

    addCustomFont("Grandstander");
    removeCustomFont("Grandstander");
    expect(calls).toBe(2);

    unsubscribe();
    addCustomFont("Inter");
    expect(calls).toBe(2);
  });
});
