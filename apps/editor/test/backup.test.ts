import { describe, expect, it } from "vitest";
import { parse } from "@youzign/designstring";
import { BackupValidationError, buildBackupBundle, parseBackupBundle } from "../src/library/backup.js";
import { shapeDocumentRecord } from "../src/library/documents.js";

const xml = '<data canvas_width="1200" canvas_height="1002" bg_color="-1" bg_type="color"></data>';

describe("backup bundles", () => {
  it("builds a portable backup from document records", () => {
    const rec = shapeDocumentRecord({
      id: "doc_1",
      name: "Poster",
      doc: { pages: [{ design: parse(xml), title: "Cover" }], activePage: 0 },
      now: 1000,
    });

    expect(buildBackupBundle([rec], "2026-07-03T10:00:00.000Z")).toEqual({
      version: 1,
      exportedAt: "2026-07-03T10:00:00.000Z",
      docs: [{ name: "Poster", pages: rec.pages, titles: ["Cover"], activePage: 0 }],
    });
  });

  it("parses and validates backup JSON", () => {
    const bundle = {
      version: 1,
      exportedAt: "2026-07-03T10:00:00.000Z",
      docs: [{ name: "Poster", pages: [xml], titles: [""], activePage: 0 }],
    };

    expect(parseBackupBundle(JSON.stringify(bundle))).toEqual(bundle);
  });

  it("reports validation errors for bad shape", () => {
    expect(() => parseBackupBundle(JSON.stringify({ version: 1, exportedAt: "x", docs: [{ name: "Bad", pages: [], titles: [], activePage: 0 }] }))).toThrow(
      BackupValidationError
    );
    expect(() => parseBackupBundle(JSON.stringify({ version: 2, exportedAt: "x", docs: [] }))).toThrow("Backup version must be 1");
  });

  it("reports validation errors for invalid page XML", () => {
    expect(() =>
      parseBackupBundle(
        JSON.stringify({
          version: 1,
          exportedAt: "2026-07-03T10:00:00.000Z",
          docs: [{ name: "Poster", pages: ["not xml"], titles: [""], activePage: 0 }],
        })
      )
    ).toThrow("Document 1 page 1 is not valid Youzign XML");
  });
});
