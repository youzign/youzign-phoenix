import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("fixture UI", () => {
  it("keeps fixtures out of the user-facing top bar", () => {
    const topBar = readFileSync(resolve(__dirname, "../src/components/TopBar.tsx"), "utf8");
    const app = readFileSync(resolve(__dirname, "../src/App.tsx"), "utf8");

    expect(topBar).not.toContain("fixture");
    expect(app).not.toContain("/fixtures/");
  });
});
