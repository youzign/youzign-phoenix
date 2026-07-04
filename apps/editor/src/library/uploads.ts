// Local image uploads ("My uploads"): pure validation + downscale math, a tiny
// IndexedDB wrapper (images are big — localStorage would blow its quota), and
// browser-side file processing. Everything that touches the DOM/IndexedDB is
// guarded so this module imports cleanly under Node (tests).

/** Longest-side cap for rasters — keeps baked data URIs (and designstrings) sane. */
export const MAX_UPLOAD_DIM = 2400;

export const ACCEPTED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export const ACCEPTED_EXT = ["png", "jpg", "jpeg", "webp", "svg"] as const;

/** A stored upload — the data URI is the source of truth (same as crop/bg bake). */
export interface UploadRecord {
  id: string;
  name: string;
  type: string;
  dataUri: string;
  width: number;
  height: number;
  createdAt: number;
  brandId?: string;
}

/* ------------------------------ pure logic ------------------------------- */

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Accept png/jpg/webp/svg. Falls back to the extension when the OS gives no type. */
export function isAcceptedFile(file: { type: string; name: string }): boolean {
  if ((ACCEPTED_MIME as readonly string[]).includes(file.type)) return true;
  if (file.type) return false; // a real, non-image type — reject
  return (ACCEPTED_EXT as readonly string[]).includes(extOf(file.name));
}

/** Downscale so the longest side is ≤ cap, preserving aspect ratio. Pure. */
export function downscaleDims(
  w: number,
  h: number,
  cap = MAX_UPLOAD_DIM
): { width: number; height: number; scale: number; scaled: boolean } {
  const longest = Math.max(w, h);
  if (longest <= cap || longest === 0) {
    return { width: w, height: h, scale: 1, scaled: false };
  }
  const scale = cap / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
    scaled: true,
  };
}

/** Canvas export mime — keep alpha for png/webp/svg; jpeg stays jpeg. */
export function canvasMime(type: string): "image/png" | "image/jpeg" {
  return type === "image/jpeg" ? "image/jpeg" : "image/png";
}

function newId(): string {
  return `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Promisify an IDBRequest. Extracted so the wrapper's success/error plumbing is
 * unit-testable without a real IndexedDB implementation.
 */
export function promisifyRequest<T>(req: {
  result: T;
  error?: unknown;
  onsuccess: ((this: unknown, ev: unknown) => void) | null;
  onerror: ((this: unknown, ev: unknown) => void) | null;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/* --------------------------- IndexedDB wrapper --------------------------- */

const DB_NAME = "youzign-next";
const DB_VERSION = 1;
const STORE = "uploads";

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("open failed"));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    return await promisifyRequest(run(store) as any);
  } finally {
    db.close();
  }
}

export async function putUpload(rec: UploadRecord): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.put(rec));
  notify();
}

/** All uploads, newest first. Returns [] when IndexedDB is unavailable. */
export async function allUploads(): Promise<UploadRecord[]> {
  if (!hasIDB()) return [];
  try {
    const all = await tx<UploadRecord[]>("readonly", (s) => s.getAll() as any);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function deleteUpload(id: string): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.delete(id));
  notify();
}

export async function setUploadBrand(id: string, brandId: string | undefined): Promise<void> {
  if (!hasIDB()) return;
  const rec = await tx<UploadRecord | undefined>("readonly", (s) => s.get(id) as any);
  if (!rec) return;
  const next = { ...rec };
  if (brandId) next.brandId = brandId;
  else delete next.brandId;
  await tx("readwrite", (s) => s.put(next));
  notify();
}

export async function uploadsForBrand(brandId: string): Promise<UploadRecord[]> {
  const uploads = await allUploads();
  return uploads.filter((upload) => upload.brandId === brandId);
}

/* ---------------------- change notification (no deps) -------------------- */

const listeners = new Set<() => void>();

/** Subscribe to library changes so open grids stay in sync across drop points. */
export function onUploadsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

/* -------------------------- browser file reading ------------------------- */

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error("read failed"));
    fr.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

/**
 * Read a File into an UploadRecord: SVGs pass through as-is; rasters larger than
 * the cap are redrawn through a canvas at the reduced size (alpha preserved for
 * png/webp). The data URI is what gets inserted — no invented designstring attrs.
 */
export async function fileToUploadRecord(file: File, cap = MAX_UPLOAD_DIM): Promise<UploadRecord> {
  const rawUri = await readAsDataUri(file);
  const base = {
    id: newId(),
    name: file.name || "upload",
    type: file.type || "image/png",
    createdAt: Date.now(),
  };

  if (file.type === "image/svg+xml" || extOf(file.name) === "svg") {
    let width = 512;
    let height = 512;
    try {
      const img = await loadImage(rawUri);
      width = img.naturalWidth || width;
      height = img.naturalHeight || height;
    } catch {
      /* keep defaults */
    }
    return { ...base, dataUri: rawUri, width, height };
  }

  const img = await loadImage(rawUri);
  const nW = img.naturalWidth || 1;
  const nH = img.naturalHeight || 1;
  const dims = downscaleDims(nW, nH, cap);
  if (!dims.scaled) {
    return { ...base, dataUri: rawUri, width: nW, height: nH };
  }
  const canvas = document.createElement("canvas");
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ...base, dataUri: rawUri, width: nW, height: nH };
  ctx.drawImage(img, 0, 0, dims.width, dims.height);
  const mime = canvasMime(file.type);
  const dataUri = canvas.toDataURL(mime, mime === "image/jpeg" ? 0.92 : undefined);
  return { ...base, dataUri, width: dims.width, height: dims.height };
}

/**
 * Validate, process, and persist a batch of dropped/selected files. Returns the
 * records actually ingested (accepted types only), newest handling last.
 */
export async function ingestFiles(
  files: FileList | File[],
  opts?: { brandId?: string }
): Promise<UploadRecord[]> {
  const out: UploadRecord[] = [];
  for (const f of Array.from(files)) {
    if (!isAcceptedFile(f)) continue;
    try {
      const base = await fileToUploadRecord(f);
      const rec = opts?.brandId ? { ...base, brandId: opts.brandId } : base;
      await putUpload(rec).catch(() => {});
      out.push(rec);
    } catch {
      /* skip unreadable file */
    }
  }
  return out;
}
