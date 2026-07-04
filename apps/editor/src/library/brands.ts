// Brand Kit metadata lives in localStorage; uploaded assets stay in IndexedDB
// and are linked by brandId. All storage access is guarded for Node/test imports.

import { signedIntToHex, type Design, type Item } from "@youzign/designstring";

export interface Brand {
  id: string;
  name: string;
  colors: string[];
  fonts: { heading?: string; body?: string };
  createdAt: number;
}

interface BrandState {
  brands: Brand[];
  activeId: string | null;
}

const LS_KEY = "youzign-next:brands";

function newId(): string {
  return `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .split("")
      .map((ch) => ch + ch)
      .join("")
      .toLowerCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

function normalizeColors(colors: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const color of colors) {
    const normalized = normalizeHex(color);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function isSentinelNumber(value: number): boolean {
  return value === -1 || !Number.isFinite(value);
}

function addIntColor(out: string[], seen: Set<string>, value: number | undefined): void {
  if (value === undefined || isSentinelNumber(value)) return;
  const normalized = normalizeHex(signedIntToHex(value));
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  out.push(normalized);
}

function addStringColor(out: string[], seen: Set<string>, value: string | undefined): void {
  if (!value) return;
  const raw = value.trim();
  if (!raw || raw === "-1" || raw.toLowerCase() === "transparent" || raw.toLowerCase() === "none") {
    return;
  }
  const normalized = normalizeHex(raw);
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  out.push(normalized);
}

/**
 * Pull an ordered starter palette from a design. This is intentionally DOM-free
 * so the Brand empty state can seed from the live document and tests can cover
 * designstring fixtures directly.
 */
export function collectDesignColors(design: Design): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const addInt = (value: number | undefined) => {
    if (out.length < 8) addIntColor(out, seen, value);
  };
  const addString = (value: string | undefined) => {
    if (out.length < 8) addStringColor(out, seen, value);
  };

  if (!design.transparent && design.bgType === "color") addInt(design.bgColor);
  if (design.borderWidth > 0) addInt(design.borderColor);

  const walk = (items: Item[]) => {
    for (const item of items) {
      if (out.length >= 8) return;
      const anyItem = item as any;
      if (item.type === "group") {
        walk(item.items);
        continue;
      }
      if (item.type === "text" || item.type === "text-curved") {
        if (!anyItem.isNoFill) {
          for (const color of item.colors) addInt(color);
        }
      } else if (item.type === "clipart") {
        const shapeFill = item.rawAttrs?.shape_fill;
        const lowerShapeFill = shapeFill?.toLowerCase();
        addString(shapeFill);
        if (!shapeFill || (lowerShapeFill !== "none" && lowerShapeFill !== "transparent")) {
          for (const color of item.colors) addInt(color);
        }
      } else if (item.type === "image") {
        addString(item.color);
      }
      if (anyItem.isBorder && (anyItem.borderSize ?? 0) > 0) addInt(anyItem.borderColor);
    }
  };
  walk(design.items);
  return out.slice(0, 8);
}

function validFonts(value: unknown): Brand["fonts"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fonts: Brand["fonts"] = {};
  const input = value as Record<string, unknown>;
  if (typeof input.heading === "string") fonts.heading = input.heading;
  else if (input.heading !== undefined) return null;
  if (typeof input.body === "string") fonts.body = input.body;
  else if (input.body !== undefined) return null;
  return fonts;
}

function validBrand(value: unknown): Brand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.id !== "string" ||
    typeof input.name !== "string" ||
    !Array.isArray(input.colors) ||
    typeof input.createdAt !== "number" ||
    !Number.isFinite(input.createdAt)
  ) {
    return null;
  }
  const fonts = validFonts(input.fonts);
  if (!fonts) return null;
  return {
    id: input.id,
    name: input.name,
    colors: normalizeColors(input.colors.filter((c): c is string => typeof c === "string")),
    fonts,
    createdAt: input.createdAt,
  };
}

function readState(): BrandState {
  if (!hasStorage()) return { brands: [], activeId: null };
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { brands: [], activeId: null };
    }
    const input = parsed as Record<string, unknown>;
    const brands = Array.isArray(input.brands)
      ? input.brands.map(validBrand).filter((b): b is Brand => !!b)
      : [];
    const activeId =
      typeof input.activeId === "string" && brands.some((brand) => brand.id === input.activeId)
        ? input.activeId
        : null;
    return { brands, activeId };
  } catch {
    return { brands: [], activeId: null };
  }
}

function writeState(state: BrandState): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / SSR */
  }
}

/* ---------------------- change notification (no deps) -------------------- */

const listeners = new Set<() => void>();

export function onBrandsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

/* ---------------------------------- API ---------------------------------- */

export function listBrands(): Brand[] {
  return readState().brands;
}

export function getBrand(id: string): Brand | undefined {
  return readState().brands.find((brand) => brand.id === id);
}

export function createBrand(init: {
  name: string;
  colors?: string[];
  fonts?: Brand["fonts"];
}): Brand {
  const state = readState();
  const brand: Brand = {
    id: newId(),
    name: init.name.trim() || "Untitled brand",
    colors: normalizeColors(init.colors ?? []),
    fonts: { ...init.fonts },
    createdAt: Date.now(),
  };
  const next = {
    brands: [...state.brands, brand],
    activeId: state.brands.length === 0 ? brand.id : state.activeId,
  };
  writeState(next);
  notify();
  return brand;
}

export function renameBrand(id: string, name: string): void {
  const state = readState();
  if (!state.brands.some((brand) => brand.id === id)) return;
  const brands = state.brands.map((brand) =>
    brand.id === id ? { ...brand, name: name.trim() || "Untitled brand" } : brand
  );
  writeState({ ...state, brands });
  notify();
}

export function deleteBrand(id: string): void {
  const state = readState();
  const brands = state.brands.filter((brand) => brand.id !== id);
  if (brands.length === state.brands.length) return;
  const activeId = state.activeId === id ? brands[0]?.id ?? null : state.activeId;
  writeState({ brands, activeId });
  notify();
}

export function setActiveBrand(id: string | null): void {
  const state = readState();
  const activeId = id && state.brands.some((brand) => brand.id === id) ? id : null;
  writeState({ ...state, activeId });
  notify();
}

export function getActiveBrandId(): string | null {
  return readState().activeId;
}

export function getActiveBrand(): Brand | undefined {
  const state = readState();
  return state.activeId ? state.brands.find((brand) => brand.id === state.activeId) : undefined;
}

export function setBrandColors(id: string, colors: string[]): void {
  const state = readState();
  if (!state.brands.some((brand) => brand.id === id)) return;
  const nextColors = normalizeColors(colors);
  const brands = state.brands.map((brand) =>
    brand.id === id ? { ...brand, colors: nextColors } : brand
  );
  writeState({ ...state, brands });
  notify();
}

export function setBrandFonts(id: string, fonts: Partial<Brand["fonts"]>): void {
  const state = readState();
  if (!state.brands.some((brand) => brand.id === id)) return;
  const brands = state.brands.map((brand) =>
    brand.id === id ? { ...brand, fonts: { ...brand.fonts, ...fonts } } : brand
  );
  writeState({ ...state, brands });
  notify();
}
