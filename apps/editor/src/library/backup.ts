import { parse } from "@youzign/designstring";
import type { DocumentRecord } from "./documents.js";

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
}

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

export function buildBackupBundle(records: readonly Pick<DocumentRecord, "name" | "pages" | "titles" | "activePage">[], exportedAt = new Date().toISOString()): BackupBundle {
  return {
    version: 1,
    exportedAt,
    docs: records.map((rec) => ({
      name: rec.name,
      pages: [...rec.pages],
      titles: [...rec.titles],
      activePage: rec.activePage,
    })),
  };
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

  return {
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
}
