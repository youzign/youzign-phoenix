import { documentRecordFromXml, putDocument } from "./documents.js";
import { convertLegacyJsonDesign } from "./legacyJson.js";
import { rewriteLegacyClipartSources } from "./legacyClipart.js";
import { asset } from "../asset.js";

const LEGACY_CLAIM_URL = "https://xnxcduqzexwukehavthg.supabase.co/functions/v1/youzign-legacy-claim";

export type LegacyImportErrorCode = "not_found" | "network" | "server";

export class LegacyImportError extends Error {
  constructor(public readonly code: LegacyImportErrorCode) {
    super(code);
    this.name = "LegacyImportError";
  }
}

export interface LegacyDownload {
  base_url: string;
  token: string;
  expires_at: string;
}

export interface LegacyUser {
  user_id: number;
  username: string;
  email_masked: string;
}

export interface LegacyDesign {
  generation: 1 | 2 | 3;
  design_id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
  thumb_url: string | null;
  // Late-era (2020-2025) designs are JSON {"canvasData":...}; get_design returns
  // that JSON in `designstring`, which we convert to designstring XML on import.
  format?: "xml" | "json";
}

export function isImportable(_design: Pick<LegacyDesign, "format">): boolean {
  // Both xml and json formats are now importable (json is converted on the fly).
  return true;
}

export interface LegacyLookupResult {
  user: LegacyUser;
  designs: LegacyDesign[];
  download: LegacyDownload;
}

export interface LegacyDesignResult {
  designstring: string;
  download: LegacyDownload;
}

export interface LegacyImageProgress {
  completed: number;
  total: number;
}

type FetchImpl = typeof fetch;

async function postLegacy<T>(body: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(LEGACY_CLAIM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LegacyImportError("network");
  }
  if (response.status === 404) throw new LegacyImportError("not_found");
  if (!response.ok) throw new LegacyImportError("server");
  try {
    return (await response.json()) as T;
  } catch {
    throw new LegacyImportError("server");
  }
}

export function lookupLegacyUser(identifier: string): Promise<LegacyLookupResult> {
  return postLegacy({ action: "lookup", identifier: identifier.trim() });
}

export function fetchLegacyDesign(
  identifier: string,
  generation: LegacyDesign["generation"],
  designId: number
): Promise<LegacyDesignResult> {
  return postLegacy({
    action: "get_design",
    identifier: identifier.trim(),
    generation,
    design_id: designId,
  });
}

export function rewriteLegacyAssetUrls(
  xml: string,
  download: Pick<LegacyDownload, "base_url" | "token">
): { xml: string; urls: string[] } {
  const baseUrl = download.base_url.replace(/\/+$/, "");
  const urls: string[] = [];
  const seen = new Set<string>();
  const track = (url: string) => {
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
    return url;
  };
  const rewritten = xml
    .replace(
      // Key stops at any ?query (e.g. ?cacheblock=true) — queries must not end
      // up inside the B2 key or in front of the ?Authorization signature.
      /(["'])(https?:\/\/(?:s3\.amazonaws\.com\/userdata\.youzign\.com|userdata\.youzign\.com\.s3\.amazonaws\.com)\/([^"'?]+)(?:\?[^"']*)?)\1/gi,
      (_match, quote: string, _url: string, key: string) =>
        `${quote}${track(`${baseUrl}/${key}?Authorization=${download.token}`)}${quote}`
    )
    .replace(
      // JSON-era designs reference assets on the WP site itself; the B2 copy
      // holds the S3-offloaded subset of those under an extra x/ segment.
      // Missing ones 404 and fall into the normal failed-asset warning path.
      /(["'])(https?:\/\/(?:www\.)?youzign\.com\/wp-content\/uploads\/([^"'?]+)(?:\?[^"']*)?)\1/gi,
      (_match, quote: string, _url: string, key: string) =>
        `${quote}${track(`${baseUrl}/wp-content/uploads/x/${key}?Authorization=${download.token}`)}${quote}`
    );
  return { xml: rewritten, urls };
}

function blobToDataUrl(blob: Blob, contentType: string): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  });
}

export async function inlineLegacyImages(
  xml: string,
  opts: { fetchImpl?: FetchImpl; onProgress?: (progress: LegacyImageProgress) => void } = {}
): Promise<{ xml: string; failed: string[] }> {
  const urls = [...new Set(
    [...xml.matchAll(/(["'])(https?:\/\/[^"']+)\1/g)]
      .map((match) => match[2])
      .filter((url) => url.includes("?Authorization="))
  )];
  const fetchImpl = opts.fetchImpl ?? fetch;
  const replacements = new Map<string, string>();
  const failed: string[] = [];
  opts.onProgress?.({ completed: 0, total: urls.length });

  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error("asset fetch failed");
      const blob = await response.blob();
      const contentType = response.headers.get("content-type")?.split(";")[0] || blob.type || "application/octet-stream";
      replacements.set(url, await blobToDataUrl(blob, contentType));
    } catch {
      failed.push(url);
    }
    opts.onProgress?.({ completed: index + 1, total: urls.length });
  }

  let inlined = xml;
  for (const [url, dataUrl] of replacements) inlined = inlined.split(url).join(dataUrl);
  return { xml: inlined, failed };
}

export async function importLegacyDesign(
  identifier: string,
  design: LegacyDesign,
  download: LegacyDownload,
  onProgress?: (progress: LegacyImageProgress) => void
): Promise<{ ok: true; failedAssets: string[] }> {
  const fetched = await fetchLegacyDesign(identifier, design.generation, design.design_id);
  const signedDownload = fetched.download ?? download;
  // JSON-format designs arrive as {"canvasData":…} in `designstring`; convert to
  // designstring XML before the URL rewrite + image inline steps.
  const designstring =
    design.format === "json"
      ? convertLegacyJsonDesign(fetched.designstring)
      : fetched.designstring;
  // Resolve built-in clipart `.swf` sources (relative AND S3/B2-hosted copies)
  // to the bundled SVGs BEFORE the asset URL-rewrite/inline pass, so those
  // `.swf` URLs are never fetched (they'd inline as an unrenderable binary).
  const clipartResolved = rewriteLegacyClipartSources(designstring, asset);
  const rewritten = rewriteLegacyAssetUrls(clipartResolved, signedDownload);
  const inlined = await inlineLegacyImages(rewritten.xml, { onProgress });
  const record = documentRecordFromXml(design.title || "Untitled", inlined.xml);
  await putDocument(record);
  return { ok: true, failedAssets: inlined.failed };
}
