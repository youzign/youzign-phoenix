import { afterEach, describe, expect, it, vi } from "vitest";
import { compareSemver, fetchUpdateInfo, isNewerVersion, RELEASES_URL } from "../src/version.js";

afterEach(() => vi.unstubAllGlobals());

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

describe("fetchUpdateInfo", () => {
  it("returns newer release metadata from a mock endpoint without caching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          version: "1.2.0",
          url: "https://example.test/youzign-1.2.0",
          notes: "Deterministic update fixture",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUpdateInfo("1.1.9", "http://127.0.0.1:43123/version.json")).resolves.toEqual({
      version: "1.2.0",
      url: "https://example.test/youzign-1.2.0",
      notes: "Deterministic update fixture",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:43123/version.json", {
      cache: "no-store",
    });
  });

  it("uses the releases page when a newer response omits its URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: "2.0.0" }), { status: 200 }))
    );

    await expect(fetchUpdateInfo("1.0.0", "http://mock/version.json")).resolves.toEqual({
      version: "2.0.0",
      url: `${RELEASES_URL}/latest`,
      notes: undefined,
    });
  });

  it.each([
    ["same version", new Response(JSON.stringify({ version: "1.0.0" }), { status: 200 })],
    ["older version", new Response(JSON.stringify({ version: "0.9.9" }), { status: 200 })],
    ["missing version", new Response(JSON.stringify({ notes: "no version" }), { status: 200 })],
    ["HTTP error", new Response("nope", { status: 503 })],
  ])("returns null for %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(fetchUpdateInfo("1.0.0", "http://mock/version.json")).resolves.toBeNull();
  });

  it("fails closed when the endpoint is unreachable or invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchUpdateInfo("1.0.0", "http://mock/version.json")).resolves.toBeNull();
  });
});
