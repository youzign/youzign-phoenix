import { describe, expect, it } from "vitest";
import { parse, serialize } from "@youzign/designstring";
import {
  addPage,
  deletePage,
  duplicatePage,
  movePage,
  parseAutosave,
  serializeDocument,
  type EditorDocument,
} from "../src/document.js";

const redXml = '<data canvas_width="800" canvas_height="600" bg_color="16711680" bg_type="color"></data>';
const blueXml = '<data canvas_width="1200" canvas_height="600" bg_color="255" bg_type="color"></data>';

function doc(activePage = 0): EditorDocument {
  return {
    pages: [{ design: parse(redXml), title: "Red" }, { design: parse(blueXml), title: "Blue" }],
    activePage,
  };
}

describe("page document operations", () => {
  it("adds a blank page after the active page with canvas/background inherited", () => {
    const next = addPage(doc(0));
    expect(next.pages).toHaveLength(3);
    expect(next.activePage).toBe(1);
    expect(next.pages[1].design.canvasWidth).toBe(800);
    expect(next.pages[1].design.bgColor).toBe(16711680);
    expect(next.pages[1].design.items).toEqual([]);
  });

  it("duplicates the requested page and activates the copy", () => {
    const next = duplicatePage(doc(0), 0);
    expect(next.pages).toHaveLength(3);
    expect(next.activePage).toBe(1);
    expect(serialize(next.pages[1].design)).toBe(serialize(next.pages[0].design));
  });

  it("keeps at least one page when deleting", () => {
    const one = { pages: [{ design: parse(redXml) }], activePage: 0 };
    expect(deletePage(one, 0).pages).toHaveLength(1);
  });

  it("adjusts active page when deleting before or at the active page", () => {
    expect(deletePage(doc(1), 0).activePage).toBe(0);
    expect(deletePage(doc(1), 1).activePage).toBe(0);
  });

  it("moves pages and tracks the active page by identity", () => {
    const next = movePage(doc(0), 0, 1);
    expect(next.activePage).toBe(1);
    expect(next.pages[1].title).toBe("Red");
  });

  it("adjusts active index when a non-active page moves across it", () => {
    const next = movePage(doc(1), 0, 1);
    expect(next.activePage).toBe(0);
    expect(next.pages[0].title).toBe("Blue");
  });
});

describe("autosave document migration", () => {
  it("loads old single-design XML autosaves as a one-page document", () => {
    const migrated = parseAutosave(redXml);
    expect(migrated.pages).toHaveLength(1);
    expect(migrated.activePage).toBe(0);
    expect(serialize(migrated.pages[0].design)).toBe(serialize(parse(redXml)));
  });

  it("round-trips document autosaves as JSON of page XML strings", () => {
    const raw = serializeDocument(doc(1));
    const loaded = parseAutosave(raw);
    expect(loaded.pages).toHaveLength(2);
    expect(loaded.activePage).toBe(1);
    expect(loaded.pages.map((p) => p.title)).toEqual(["Red", "Blue"]);
  });
});
