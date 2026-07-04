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

  it("round-trips brands and brand assets", () => {
    const bundle = buildBackupBundle(
      [
        {
          name: "Poster",
          pages: [xml],
          titles: ["Cover"],
          activePage: 0,
        },
      ],
      "2026-07-03T10:00:00.000Z",
      {
        brands: [
          {
            id: "br_acme",
            name: "Acme",
            colors: ["#ABC", "#112233"],
            fonts: { heading: "Inter", body: "Roboto" },
            createdAt: 123,
          },
          {
            id: "br_other",
            name: "Other",
            colors: [],
            fonts: {},
            createdAt: 456,
          },
        ],
        activeBrandId: "br_acme",
        brandAssets: [
          {
            id: "up_logo",
            name: "logo.png",
            type: "image/png",
            dataUri: "data:image/png;base64,AAA",
            width: 120,
            height: 80,
            createdAt: 789,
            brandId: "br_acme",
          },
        ],
      }
    );

    expect(parseBackupBundle(JSON.stringify(bundle))).toEqual({
      version: 1,
      exportedAt: "2026-07-03T10:00:00.000Z",
      docs: [{ name: "Poster", pages: [xml], titles: ["Cover"], activePage: 0 }],
      brands: [
        {
          id: "br_acme",
          name: "Acme",
          colors: ["#aabbcc", "#112233"],
          fonts: { heading: "Inter", body: "Roboto" },
          createdAt: 123,
          active: true,
        },
        {
          id: "br_other",
          name: "Other",
          colors: [],
          fonts: {},
          createdAt: 456,
          active: false,
        },
      ],
      brandAssets: [
        {
          id: "up_logo",
          name: "logo.png",
          type: "image/png",
          dataUri: "data:image/png;base64,AAA",
          width: 120,
          height: 80,
          createdAt: 789,
          brandId: "br_acme",
        },
      ],
    });
  });

  it("keeps old backup bundles without brands compatible", () => {
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

  it("reports validation errors for malformed brand entries", () => {
    expect(() =>
      parseBackupBundle(
        JSON.stringify({
          version: 1,
          exportedAt: "2026-07-03T10:00:00.000Z",
          docs: [{ name: "Poster", pages: [xml], titles: [""], activePage: 0 }],
          brands: [{ id: "br_bad", name: "Bad", colors: ["not-a-color"], fonts: {}, createdAt: 1, active: true }],
        })
      )
    ).toThrow("Brand 1 color 1 must be a hex color");

    expect(() =>
      parseBackupBundle(
        JSON.stringify({
          version: 1,
          exportedAt: "2026-07-03T10:00:00.000Z",
          docs: [{ name: "Poster", pages: [xml], titles: [""], activePage: 0 }],
          brands: [{ id: "br_bad", name: "Bad", colors: [], fonts: { heading: 42 }, createdAt: 1, active: true }],
        })
      )
    ).toThrow("Brand 1 fonts.heading must be a string");
  });

  it("reports validation errors for malformed brand assets", () => {
    expect(() =>
      parseBackupBundle(
        JSON.stringify({
          version: 1,
          exportedAt: "2026-07-03T10:00:00.000Z",
          docs: [{ name: "Poster", pages: [xml], titles: [""], activePage: 0 }],
          brands: [{ id: "br_acme", name: "Acme", colors: [], fonts: {}, createdAt: 1, active: true }],
          brandAssets: [
            {
              id: "up_logo",
              name: "logo.png",
              type: "image/png",
              dataUri: "data:image/png;base64,AAA",
              width: 120,
              height: 80,
              createdAt: 789,
              brandId: "br_missing",
            },
          ],
        })
      )
    ).toThrow("Brand asset 1 brandId must reference an exported brand");
  });
});
