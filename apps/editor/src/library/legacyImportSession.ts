import type { LegacyDesign, LegacyUser } from "./legacyImport.js";

export const LEGACY_IMPORT_BATCH_SIZE = 100;
export const LEGACY_IMPORT_SESSION_KEY = "youzign:legacy-import-session:v1";

export type LegacyImportStatus = "pending" | "imported" | "failed" | "unavailable";

export interface LegacyImportItem {
  key: string;
  design: LegacyDesign;
  status: LegacyImportStatus;
  error?: string;
}

export interface LegacyImportSession {
  version: 1;
  identifier: string;
  user: LegacyUser;
  items: LegacyImportItem[];
  updatedAt: number;
}

export function legacyDesignKey(design: Pick<LegacyDesign, "generation" | "design_id">): string {
  return `${design.generation}:${design.design_id}`;
}

export function legacyDocumentId(userId: number, design: Pick<LegacyDesign, "generation" | "design_id">): string {
  return `legacy:${userId}:${legacyDesignKey(design)}`;
}

export function createLegacyImportSession(
  identifier: string,
  user: LegacyUser,
  designs: readonly LegacyDesign[],
  now = Date.now()
): LegacyImportSession {
  return {
    version: 1,
    identifier: identifier.trim(),
    user,
    items: designs.map((design) => ({ key: legacyDesignKey(design), design, status: "pending" })),
    updatedAt: now,
  };
}

export function loadLegacyImportSession(storage: Pick<Storage, "getItem"> = localStorage): LegacyImportSession | null {
  try {
    const value = storage.getItem(LEGACY_IMPORT_SESSION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as LegacyImportSession;
    if (parsed?.version !== 1 || !parsed.user || !Array.isArray(parsed.items) || !parsed.identifier) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLegacyImportSession(
  session: LegacyImportSession,
  storage: Pick<Storage, "setItem"> = localStorage
): LegacyImportSession {
  const next = { ...session, updatedAt: Date.now() };
  storage.setItem(LEGACY_IMPORT_SESSION_KEY, JSON.stringify(next));
  return next;
}

export function legacyImportBatch(session: LegacyImportSession, size = LEGACY_IMPORT_BATCH_SIZE): LegacyImportItem[] {
  return session.items.filter((item) => item.status === "pending").slice(0, size);
}

export function legacyImportSummary(session: LegacyImportSession) {
  const count = (status: LegacyImportStatus) => session.items.filter((item) => item.status === status).length;
  return {
    total: session.items.length,
    pending: count("pending"),
    imported: count("imported"),
    failed: count("failed"),
    unavailable: count("unavailable"),
  };
}

export function commitLegacyImportItem(
  session: LegacyImportSession,
  key: string,
  status: Exclude<LegacyImportStatus, "pending">,
  error?: string
): LegacyImportSession {
  return {
    ...session,
    items: session.items.map((item) => item.key === key ? { ...item, status, error } : item),
  };
}

export function retryLegacyImportItems(session: LegacyImportSession, keys: readonly string[]): LegacyImportSession {
  const retry = new Set(keys);
  return {
    ...session,
    items: session.items.map((item) => retry.has(item.key) ? { ...item, status: "pending", error: undefined } : item),
  };
}
