import { describe, expect, it } from "vitest";
import { compareSemver, isNewerVersion } from "../src/version.js";

describe("compareSemver", () => {
  it("orders patch, minor, and major versions numerically", () => {
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    expect(compareSemver("1.2.0", "1.10.0")).toBe(-1);
    expect(compareSemver("2.0.0", "1.99.99")).toBe(1);
  });

  it("treats missing numeric fields as zero", () => {
    expect(compareSemver("1", "1.0.0")).toBe(0);
    expect(compareSemver("1.2", "1.2.0")).toBe(0);
  });

  it("accepts a leading v and ignores build/prerelease suffixes", () => {
    expect(compareSemver("v1.0.1+5", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.0-beta.1", "1.0.0")).toBe(0);
  });
});

describe("isNewerVersion", () => {
  it("returns true only when the candidate is newer than the current app", () => {
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("0.9.9", "1.0.0")).toBe(false);
  });
});
