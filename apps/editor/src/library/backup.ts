import { parse } from "@youzign/designstring";
import type { Brand } from "./brands.js";
import type { DocumentRecord } from "./documents.js";
import type { UploadRecord } from "./uploads.js";

export interface BackupDoc {
  name: string;
  pages: string[];
  titles: string[];
  activePage: number;
}

export interface BackupBundle {
  version: 1;
  exportedAt: string;
  docs: BackupDoc[];
  brands?: BackupBrand[];
  brandAssets?: BackupBrandAsset[];
}

export interface BackupBrand extends Brand {
  active: boolean;
}

export type BackupBrandAsset = Pick<
  Required<UploadRecord>,
  "id" | "name" | "type" | "dataUri" | "width" | "height" | "createdAt" | "brandId"
>;

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

function fail(message: string): never {
  throw new BackupValidationError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateXml(xml: string, label: string): void {
  try {
    parse(xml);
  } catch {
    fail(`${label} is not valid Youzign XML`);
  }
}

function validateHex(color: string): string | null {
  const raw = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split("").map((ch) => ch + ch).join("").toLowerCase()}`;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

function validateBrand(value: unknown, index: number): BackupBrand {
  const label = `Brand ${index + 1}`;
  if (!isObject(value)) fail(`${label} must be an object`);
  if (typeof value.id !== "string" || !value.id.trim()) fail(`${label} id must be a string`);
  if (typeof value.name !== "string") fail(`${label} name must be a string`);
  if (!Array.isArray(value.colors)) fail(`${label} colors must be an array`);
  if (!isObject(value.fonts)) fail(`${label} fonts must be an object`);
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) fail(`${label} createdAt must be a number`);
  if (typeof value.active !== "boolean") fail(`${label} active must be a boolean`);

  const fonts: Brand["fonts"] = {};
  if (typeof value.fonts.heading === "string") fonts.heading = value.fonts.heading;
  else if (value.fonts.heading !== undefined) fail(`${label} fonts.heading must be a string`);
  if (typeof value.fonts.body === "string") fonts.body = value.fonts.body;
  else if (value.fonts.body !== undefined) fail(`${label} fonts.body must be a string`);

  return {
    id: value.id,
    name: value.name,
    colors: value.colors.map((color, colorIndex) => {
      if (typeof color !== "string") fail(`${label} color ${colorIndex + 1} must be a string`);
      const normalized = validateHex(color);
      if (!normalized) fail(`${label} color ${colorIndex + 1} must be a hex color`);
      return normalized;
    }),
    fonts,
    createdAt: value.createdAt,
    active: value.active,
  };
}

function validateBrandAsset(value: unknown, index: number, brandIds: Set<string>): BackupBrandAsset {
  const label = `Brand asset ${index + 1}`;
  if (!isObject(value)) fail(`${label} must be an object`);
  if (typeof value.id !== "string" || !value.id.trim()) fail(`${label} id must be a string`);
  if (typeof value.name !== "string") fail(`${label} name must be a string`);
  if (typeof value.type !== "string" || !value.type.trim()) fail(`${label} type must be a string`);
  if (typeof value.dataUri !== "string" || !value.dataUri.trim()) fail(`${label} dataUri must be a string`);
  if (typeof value.width !== "number" || !Number.isFinite(value.width) || value.width <= 0) fail(`${label} width must be a positive number`);
  if (typeof value.height !== "number" || !Number.isFinite(value.height) || value.height <= 0) fail(`${label} height must be a positive number`);
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) fail(`${label} createdAt must be a number`);
  if (typeof value.brandId !== "string" || !value.brandId.trim()) fail(`${label} brandId must be a string`);
  if (!brandIds.has(value.brandId)) fail(`${label} brandId must reference an exported brand`);
  return {
    id: value.id,
    name: value.name,
    type: value.type,
    dataUri: value.dataUri,
    width: value.width,
    height: value.height,
    createdAt: value.createdAt,
    brandId: value.brandId,
  };
}

export function buildBackupBundle(
  records: readonly Pick<DocumentRecord, "name" | "pages" | "titles" | "activePage">[],
  exportedAt = new Date().toISOString(),
  extras?: { brands?: readonly Brand[]; activeBrandId?: string | null; brandAssets?: readonly BackupBrandAsset[] }
): BackupBundle {
  const bundle: BackupBundle = {
    version: 1,
    exportedAt,
    docs: records.map((rec) => ({
      name: rec.name,
      pages: [...rec.pages],
      titles: [...rec.titles],
      activePage: rec.activePage,
    })),
  };
  if (extras?.brands) {
    bundle.brands = extras.brands.map((brand) => ({
      ...brand,
      colors: [...brand.colors],
      fonts: { ...brand.fonts },
      active: brand.id === extras.activeBrandId,
    }));
  }
  if (extras?.brandAssets) {
    bundle.brandAssets = extras.brandAssets.map((asset) => ({ ...asset }));
  }
  return bundle;
}

export function parseBackupBundle(raw: string): BackupBundle {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    fail("Backup file is not valid JSON");
  }

  if (!isObject(payload)) fail("Backup must be an object");
  if (payload.version !== 1) fail("Backup version must be 1");
  if (typeof payload.exportedAt !== "string" || !payload.exportedAt.trim()) fail("Backup exportedAt must be a string");
  if (!Array.isArray(payload.docs)) fail("Backup docs must be an array");

  const brands = payload.brands === undefined ? undefined : (() => {
    if (!Array.isArray(payload.brands)) fail("Backup brands must be an array");
    const parsed = payload.brands.map(validateBrand);
    if (parsed.filter((brand) => brand.active).length > 1) fail("Backup brands can only contain one active brand");
    return parsed;
  })();
  const brandIds = new Set((brands ?? []).map((brand) => brand.id));
  const brandAssets = payload.brandAssets === undefined ? undefined : (() => {
    if (!Array.isArray(payload.brandAssets)) fail("Backup brandAssets must be an array");
    if (!brands) fail("Backup brandAssets require exported brands");
    return payload.brandAssets.map((asset, assetIndex) => validateBrandAsset(asset, assetIndex, brandIds));
  })();

  const bundle: BackupBundle = {
    version: 1,
    exportedAt: payload.exportedAt,
    docs: payload.docs.map((doc, docIndex) => {
      if (!isObject(doc)) fail(`Document ${docIndex + 1} must be an object`);
      if (typeof doc.name !== "string") fail(`Document ${docIndex + 1} name must be a string`);
      if (!Array.isArray(doc.pages) || doc.pages.length === 0) fail(`Document ${docIndex + 1} pages must be a non-empty array`);
      if (!Array.isArray(doc.titles)) fail(`Document ${docIndex + 1} titles must be an array`);
      if (typeof doc.activePage !== "number" || !Number.isFinite(doc.activePage) || !Number.isInteger(doc.activePage)) {
        fail(`Document ${docIndex + 1} activePage must be an integer`);
      }

      const pages = doc.pages.map((page, pageIndex) => {
        if (typeof page !== "string" || !page.trim()) fail(`Document ${docIndex + 1} page ${pageIndex + 1} must be XML text`);
        validateXml(page, `Document ${docIndex + 1} page ${pageIndex + 1}`);
        return page;
      });
      const titles = doc.titles.map((title, titleIndex) => {
        if (typeof title !== "string") fail(`Document ${docIndex + 1} title ${titleIndex + 1} must be a string`);
        return title;
      });
      if (doc.activePage < 0 || doc.activePage >= pages.length) fail(`Document ${docIndex + 1} activePage is out of range`);

      return {
        name: doc.name,
        pages,
        titles,
        activePage: doc.activePage,
      };
    }),
  };
  if (brands) bundle.brands = brands;
  if (brandAssets) bundle.brandAssets = brandAssets;
  return bundle;
}
