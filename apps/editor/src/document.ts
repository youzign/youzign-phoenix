import { parse, serialize, type Design } from "@youzign/designstring";
import { remapLegacyDesign } from "./library/remapLegacy.js";

export interface PageEntry {
  design: Design;
  title?: string;
}

export interface EditorDocument {
  pages: PageEntry[];
  activePage: number;
}

export interface SerializedDocument {
  version: 1;
  pages: string[];
  titles?: string[];
  activePage: number;
}

export function clampActivePage(activePage: number, count: number): number {
  return Math.max(0, Math.min(Math.trunc(activePage) || 0, Math.max(0, count - 1)));
}

export function snapshotDocument(doc: EditorDocument): EditorDocument {
  return structuredClone(doc);
}

export function normalizeDocument(doc: EditorDocument): EditorDocument {
  const pages = doc.pages.length > 0 ? doc.pages : [{ design: blankDesign() }];
  return {
    pages,
    activePage: clampActivePage(doc.activePage, pages.length),
  };
}

export function blankDesign(): Design {
  return parse('<data canvas_width="800" canvas_height="600" bg_color="-1" bg_type="color"></data>');
}

export function blankPageFrom(source: Design): PageEntry {
  const design = snapshotDocument({ pages: [{ design: source }], activePage: 0 }).pages[0].design;
  design.items = [];
  return { design };
}

export function duplicatePage(doc: EditorDocument, index: number): EditorDocument {
  const next = snapshotDocument(normalizeDocument(doc));
  const at = clampActivePage(index, next.pages.length);
  next.pages.splice(at + 1, 0, structuredClone(next.pages[at]));
  next.activePage = at + 1;
  return next;
}

export function addPage(doc: EditorDocument): EditorDocument {
  const next = snapshotDocument(normalizeDocument(doc));
  const at = clampActivePage(next.activePage, next.pages.length);
  next.pages.splice(at + 1, 0, blankPageFrom(next.pages[at].design));
  next.activePage = at + 1;
  return next;
}

export function deletePage(doc: EditorDocument, index: number): EditorDocument {
  const current = normalizeDocument(doc);
  if (current.pages.length <= 1) return snapshotDocument(current);
  const at = clampActivePage(index, current.pages.length);
  const next = snapshotDocument(current);
  next.pages.splice(at, 1);
  if (current.activePage > at) next.activePage = current.activePage - 1;
  else if (current.activePage === at) next.activePage = Math.min(at, next.pages.length - 1);
  return next;
}

export function movePage(doc: EditorDocument, from: number, to: number): EditorDocument {
  const current = normalizeDocument(doc);
  const count = current.pages.length;
  const src = clampActivePage(from, count);
  const dst = clampActivePage(to, count);
  if (src === dst) return snapshotDocument(current);
  const next = snapshotDocument(current);
  const [page] = next.pages.splice(src, 1);
  next.pages.splice(dst, 0, page);
  if (current.activePage === src) next.activePage = dst;
  else if (src < current.activePage && current.activePage <= dst) next.activePage = current.activePage - 1;
  else if (dst <= current.activePage && current.activePage < src) next.activePage = current.activePage + 1;
  return next;
}

export function serializeDocument(doc: EditorDocument): string {
  const current = normalizeDocument(doc);
  const titles = current.pages.map((p) => p.title ?? "");
  const payload: SerializedDocument = {
    version: 1,
    pages: current.pages.map((p) => serialize(p.design)),
    titles,
    activePage: current.activePage,
  };
  return JSON.stringify(payload);
}

export function parseAutosave(raw: string): EditorDocument {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const payload = JSON.parse(trimmed) as Partial<SerializedDocument>;
    if (Array.isArray(payload.pages) && payload.pages.length > 0) {
      const titles = Array.isArray(payload.titles) ? payload.titles : [];
      return normalizeDocument({
        pages: payload.pages.map((xml, i) => ({
          design: remapLegacyDesign(parse(xml)),
          title: titles[i] || undefined,
        })),
        activePage: payload.activePage ?? 0,
      });
    }
  }
  return { pages: [{ design: remapLegacyDesign(parse(raw)) }], activePage: 0 };
}

export function documentFromXml(xml: string): EditorDocument {
  return { pages: [{ design: remapLegacyDesign(parse(xml)) }], activePage: 0 };
}
