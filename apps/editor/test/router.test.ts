import { describe, expect, it } from "vitest";
import { dashboardHash, editorHash, parseHashRoute } from "../src/router.js";

describe("hash route parsing", () => {
  it("routes blank and dashboard hashes to the dashboard", () => {
    expect(parseHashRoute("")).toEqual({ view: "dashboard", tab: "designs" });
    expect(parseHashRoute("#/")).toEqual({ view: "dashboard", tab: "designs" });
    expect(parseHashRoute("#/something")).toEqual({ view: "dashboard", tab: "designs" });
  });

  it("routes dashboard tabs", () => {
    expect(parseHashRoute("#/help")).toEqual({ view: "dashboard", tab: "help" });
    expect(parseHashRoute("#/backup")).toEqual({ view: "dashboard", tab: "backup" });
  });

  it("routes document hashes to the editor", () => {
    expect(parseHashRoute("#/d/abc")).toEqual({ view: "editor", id: "abc" });
    expect(parseHashRoute(editorHash("id with space"))).toEqual({ view: "editor", id: "id with space" });
  });

  it("formats canonical hashes", () => {
    expect(dashboardHash()).toBe("#/");
    expect(editorHash("doc/1")).toBe("#/d/doc%2F1");
  });
});
