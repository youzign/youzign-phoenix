import { parse, serialize } from "@youzign/designstring";
import { documentFromXml, type EditorDocument, normalizeDocument, parseAutosave } from "../document.js";
import { LS_PREFIX } from "../store.js";
import { remapLegacyDesign } from "./remapLegacy.js";
import { promisifyRequest } from "./uploads.js";

export interface DocumentRecord {
  id: string;
  name: string;
  pages: string[];
  titles: string[];
  activePage: number;
  width: number;
  height: number;
  thumb: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecordDraft {
  id?: string;
  name: string;
  doc: EditorDocument;
  previous?: DocumentRecord | null;
  thumb?: string;
  now?: number;
}

export type DocumentSortOrder = "newest" | "oldest";

export const DASHBOARD_PAGE_SIZE = 24;

const DB_NAME = "youzign-docs";
const DB_VERSION = 1;
const STORE = "documents";
const MIGRATION_KEY = "youzign-docs:migrated-localstorage-v1";

function hasIDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function newId(): string {
  return crypto.randomUUID();
}

export function blankThumb(): string {
  return "";
}

export function cleanDocName(name: string): string {
  const trimmed = name.trim();
  return trimmed || "Untitled design";
}

export function shapeDocumentRecord({
  id,
  name,
  doc,
  previous,
  thumb,
  now = Date.now(),
}: RecordDraft): DocumentRecord {
  const current = normalizeDocument(doc);
  const first = current.pages[0].design;
  return {
    id: id ?? previous?.id ?? newId(),
    name: cleanDocName(name),
    pages: current.pages.map((p) => serialize(p.design)),
    titles: current.pages.map((p) => p.title ?? ""),
    activePage: current.activePage,
    width: first.canvasWidth,
    height: first.canvasHeight,
    thumb: thumb ?? previous?.thumb ?? blankThumb(),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function documentRecordFromXml(name: string, xml: string, now = Date.now()): DocumentRecord {
  return shapeDocumentRecord({ name, doc: documentFromXml(xml), now });
}

export function editorDocumentFromRecord(rec: Pick<DocumentRecord, "pages" | "titles" | "activePage">): EditorDocument {
  return normalizeDocument({
    pages: rec.pages.map((xml, i) => ({
      design: remapLegacyDesign(parse(xml)),
      title: rec.titles[i] || undefined,
    })),
    activePage: rec.activePage,
  });
}

export function recordFromAutosave(key: string, raw: string, now = Date.now()): DocumentRecord | null {
  if (!key.startsWith(LS_PREFIX)) return null;
  const name = key.slice(LS_PREFIX.length) || "Untitled design";
  try {
    return shapeDocumentRecord({ name, doc: parseAutosave(raw), now });
  } catch {
    return null;
  }
}

export function migrationRecordsFromStorage(storage: Pick<Storage, "length" | "key" | "getItem">, now = Date.now()): DocumentRecord[] {
  const out: DocumentRecord[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    const rec = recordFromAutosave(key, raw, now + out.length);
    if (rec) out.push(rec);
  }
  return out;
}

export function relativeEditedTime(updatedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 45) return "edited just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `edited ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `edited ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `edited ${months}mo ago`;
  return `edited ${Math.floor(months / 12)}y ago`;
}

export function documentMetaLine(rec: Pick<DocumentRecord, "width" | "height" | "pages" | "updatedAt">, now = Date.now()): string {
  const pageLabel = rec.pages.length === 1 ? "1 page" : `${rec.pages.length} pages`;
  return `${rec.width}×${rec.height} · ${pageLabel} · ${relativeEditedTime(rec.updatedAt, now)}`;
}

export function duplicateRecord(rec: DocumentRecord, now = Date.now()): DocumentRecord {
  return {
    ...structuredClone(rec),
    id: newId(),
    name: `${rec.name} copy`,
    createdAt: now,
    updatedAt: now,
  };
}

export function sortDocuments<T extends Pick<DocumentRecord, "updatedAt">>(
  records: readonly T[],
  order: DocumentSortOrder = "newest"
): T[] {
  const dir = order === "newest" ? -1 : 1;
  return [...records].sort((a, b) => (a.updatedAt - b.updatedAt) * dir);
}

export function pageCount(total: number, pageSize = DASHBOARD_PAGE_SIZE): number {
  if (pageSize <= 0) return 0;
  return Math.ceil(Math.max(0, total) / pageSize);
}

export function pageDocuments<T>(
  records: readonly T[],
  page: number,
  pageSize = DASHBOARD_PAGE_SIZE
): T[] {
  if (pageSize <= 0) return [];
  const current = Math.min(Math.max(1, page), Math.max(1, pageCount(records.length, pageSize)));
  const start = (current - 1) * pageSize;
  return records.slice(start, start + pageSize);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
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

export async function putDocument(rec: DocumentRecord): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.put(rec));
  notify();
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  if (!hasIDB()) return null;
  try {
    return (await tx<DocumentRecord | undefined>("readonly", (s) => s.get(id) as any)) ?? null;
  } catch {
    return null;
  }
}

export async function allDocuments(): Promise<DocumentRecord[]> {
  if (!hasIDB()) return [];
  try {
    const all = await tx<DocumentRecord[]>("readonly", (s) => s.getAll() as any);
    return sortDocuments(all, "newest");
  } catch {
    return [];
  }
}

export async function deleteDocument(id: string): Promise<void> {
  if (!hasIDB()) return;
  await tx("readwrite", (s) => s.delete(id));
  notify();
}

export async function migrateLocalStorageAutosaves(): Promise<void> {
  if (!hasIDB() || typeof localStorage === "undefined") return;
  if (localStorage.getItem(MIGRATION_KEY)) return;
  const records = migrationRecordsFromStorage(localStorage);
  for (const rec of records) await putDocument(rec);
  localStorage.setItem(MIGRATION_KEY, "1");
}

const listeners = new Set<() => void>();

export function onDocumentsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}
