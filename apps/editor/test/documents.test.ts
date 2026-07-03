import { describe, expect, it } from "vitest";
import { parse } from "@youzign/designstring";
import {
  documentMetaLine,
  editorDocumentFromRecord,
  migrationRecordsFromStorage,
  pageCount,
  pageDocuments,
  recordFromAutosave,
  relativeEditedTime,
  shapeDocumentRecord,
  sortDocuments,
} from "../src/library/documents.js";
import { LS_PREFIX } from "../src/store.js";

const xml = '<data canvas_width="1200" canvas_height="1002" bg_color="-1" bg_type="color"></data>';

describe("document record shaping", () => {
  it("serializes an editor document into the dashboard record shape", () => {
    const rec = shapeDocumentRecord({
      id: "doc_1",
      name: "  Launch graphic  ",
      doc: { pages: [{ design: parse(xml), title: "Cover" }], activePage: 0 },
      thumb: "data:image/jpeg;base64,x",
      now: 1000,
    });

    expect(rec).toMatchObject({
      id: "doc_1",
      name: "Launch graphic",
      titles: ["Cover"],
      activePage: 0,
      width: 1200,
      height: 1002,
      thumb: "data:image/jpeg;base64,x",
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(rec.pages[0]).toContain('canvas_width="1200"');
  });

  it("preserves createdAt and thumbnail when updating an existing record", () => {
    const previous = shapeDocumentRecord({
      id: "doc_1",
      name: "Old",
      doc: { pages: [{ design: parse(xml) }], activePage: 0 },
      thumb: "thumb",
      now: 1000,
    });
    const next = shapeDocumentRecord({
      id: "doc_1",
      name: "New",
      doc: { pages: [{ design: parse(xml) }], activePage: 0 },
      previous,
      now: 2000,
    });
    expect(next.createdAt).toBe(1000);
    expect(next.updatedAt).toBe(2000);
    expect(next.thumb).toBe("thumb");
  });

  it("round-trips records back to editor documents", () => {
    const rec = shapeDocumentRecord({
      id: "doc_1",
      name: "Doc",
      doc: { pages: [{ design: parse(xml), title: "Page" }], activePage: 0 },
      now: 1000,
    });
    const doc = editorDocumentFromRecord(rec);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].title).toBe("Page");
    expect(doc.pages[0].design.canvasHeight).toBe(1002);
  });
});

describe("localStorage autosave migration mapping", () => {
  it("maps legacy autosave keys and ignores unrelated storage", () => {
    const entries = new Map([
      [LS_PREFIX + "Poster", xml],
      ["other", xml],
    ]);
    const storage = {
      length: entries.size,
      key: (i: number) => [...entries.keys()][i] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
    };

    const records = migrationRecordsFromStorage(storage as Storage, 5000);
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("Poster");
    expect(records[0].width).toBe(1200);
    expect(recordFromAutosave("bad", xml)).toBeNull();
  });
});

describe("dashboard time and meta formatting", () => {
  it("formats relative edited time", () => {
    expect(relativeEditedTime(10_000, 12_000)).toBe("edited just now");
    expect(relativeEditedTime(0, 3 * 60_000)).toBe("edited 3m ago");
    expect(relativeEditedTime(0, 2 * 60 * 60_000)).toBe("edited 2h ago");
    expect(relativeEditedTime(0, 4 * 24 * 60 * 60_000)).toBe("edited 4d ago");
  });

  it("formats dashboard card metadata", () => {
    const rec = shapeDocumentRecord({
      id: "doc_1",
      name: "Doc",
      doc: { pages: [{ design: parse(xml) }, { design: parse(xml) }, { design: parse(xml) }], activePage: 0 },
      now: 0,
    });
    expect(documentMetaLine(rec, 2 * 60 * 60_000)).toBe("1200×1002 · 3 pages · edited 2h ago");
  });
});

describe("dashboard sorting and pagination", () => {
  it("sorts records by updatedAt newest or oldest without mutating input", () => {
    const records = [
      { id: "a", updatedAt: 200 },
      { id: "b", updatedAt: 300 },
      { id: "c", updatedAt: 100 },
    ];

    expect(sortDocuments(records, "newest").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortDocuments(records, "oldest").map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(records.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("slices dashboard pages and clamps out-of-range page numbers", () => {
    const records = Array.from({ length: 7 }, (_, i) => `doc-${i + 1}`);

    expect(pageDocuments(records, 1, 3)).toEqual(["doc-1", "doc-2", "doc-3"]);
    expect(pageDocuments(records, 2, 3)).toEqual(["doc-4", "doc-5", "doc-6"]);
    expect(pageDocuments(records, 3, 3)).toEqual(["doc-7"]);
    expect(pageDocuments(records, 99, 3)).toEqual(["doc-7"]);
    expect(pageDocuments(records, 0, 3)).toEqual(["doc-1", "doc-2", "doc-3"]);
  });

  it("counts pages across empty, partial, exact, and invalid page-size cases", () => {
    expect(pageCount(0, 24)).toBe(0);
    expect(pageCount(1, 24)).toBe(1);
    expect(pageCount(24, 24)).toBe(1);
    expect(pageCount(25, 24)).toBe(2);
    expect(pageCount(48, 24)).toBe(2);
    expect(pageCount(49, 24)).toBe(3);
    expect(pageCount(12, 0)).toBe(0);
  });
});
