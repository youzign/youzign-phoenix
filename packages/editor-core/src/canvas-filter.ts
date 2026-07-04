import type { Design, FilterItem, RawCarrier } from "@youzign/designstring";
import { setRaw } from "./mutations.js";

export type CanvasAdjustmentKey =
  | "brightness"
  | "contrast"
  | "saturation"
  | "hue"
  | "warmth"
  | "vignette";

const ADJ_ATTR: Record<CanvasAdjustmentKey, string> = {
  brightness: "adj_brightness",
  contrast: "adj_contrast",
  saturation: "adj_saturation",
  hue: "adj_hue",
  warmth: "adj_warmth",
  vignette: "adj_vignette",
};

const ADJ_FIELD: Record<CanvasAdjustmentKey, keyof FilterItem> = {
  brightness: "adjBrightness",
  contrast: "adjContrast",
  saturation: "adjSaturation",
  hue: "adjHue",
  warmth: "adjWarmth",
  vignette: "adjVignette",
};

function filterItem(design: Design): FilterItem | undefined {
  return design.items.find((item) => item.type === "filter") as FilterItem | undefined;
}

function removeRaw(carrier: RawCarrier, key: string): void {
  delete carrier.rawAttrs[key];
  delete carrier.extraAttrs[key];
  carrier.attrOrder = carrier.attrOrder.filter((k) => k !== key);
}

function hasAdjustments(item: FilterItem | undefined): boolean {
  return !!item && (
    item.adjBrightness !== 0 ||
    item.adjContrast !== 0 ||
    item.adjSaturation !== 0 ||
    item.adjHue !== 0 ||
    item.adjWarmth !== 0 ||
    item.adjVignette !== 0
  );
}

function maybeRemoveNeutralOriginal(design: Design, item: FilterItem): void {
  if (item.filterid === 1 && !hasAdjustments(item)) {
    design.items = design.items.filter((it) => it !== item);
  }
}

function ensureFilterItem(design: Design): FilterItem {
  const existing = filterItem(design);
  if (existing) return existing;
  const item: FilterItem = {
    type: "filter",
    filterid: 1,
    opacity: 1,
    adjBrightness: 0,
    adjContrast: 0,
    adjSaturation: 0,
    adjHue: 0,
    adjWarmth: 0,
    adjVignette: 0,
    rawAttrs: { type: "filter", filterid: "1", opacity: "1" },
    attrOrder: ["type", "filterid", "opacity"],
    extraAttrs: {},
  };
  design.items.push(item);
  return item;
}

export function getCanvasFilter(design: Design): FilterItem | undefined {
  return filterItem(design);
}

export function setCanvasFilter(design: Design, filterid: number | null): void {
  const existing = filterItem(design);
  if ((filterid === null || filterid === 1) && !hasAdjustments(existing)) {
    if (existing) design.items = design.items.filter((it) => it !== existing);
    return;
  }

  const item = ensureFilterItem(design);
  item.filterid = filterid ?? 1;
  setRaw(item, "filterid", String(item.filterid));
  if (!("opacity" in item.rawAttrs)) setRaw(item, "opacity", String(item.opacity));
  maybeRemoveNeutralOriginal(design, item);
}

export function setCanvasFilterAlpha(design: Design, alpha: number): void {
  const item = ensureFilterItem(design);
  item.opacity = Math.max(0, Math.min(1, alpha));
  setRaw(item, "opacity", String(item.opacity));
  maybeRemoveNeutralOriginal(design, item);
}

export function setCanvasAdjustment(
  design: Design,
  key: CanvasAdjustmentKey,
  value: number
): void {
  const item = ensureFilterItem(design);
  const v = clampAdjustment(key, value);
  (item as any)[ADJ_FIELD[key]] = v;
  const attr = ADJ_ATTR[key];
  if (v === 0) removeRaw(item, attr);
  else setRaw(item, attr, String(v));
  maybeRemoveNeutralOriginal(design, item);
}

export function resetCanvasAdjustments(design: Design): void {
  const item = filterItem(design);
  if (!item) return;
  for (const key of Object.keys(ADJ_ATTR) as CanvasAdjustmentKey[]) {
    (item as any)[ADJ_FIELD[key]] = 0;
    removeRaw(item, ADJ_ATTR[key]);
  }
  maybeRemoveNeutralOriginal(design, item);
}

export function canvasAdjustmentsNeutral(item: FilterItem | undefined): boolean {
  return !hasAdjustments(item);
}

function clampAdjustment(key: CanvasAdjustmentKey, value: number): number {
  if (key === "hue") return Math.max(-180, Math.min(180, Math.round(value)));
  if (key === "vignette") return Math.max(0, Math.min(100, Math.round(value)));
  return Math.max(-100, Math.min(100, Math.round(value)));
}
