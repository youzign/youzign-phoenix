import { afterEach, describe, expect, it, vi } from "vitest";

// Follows the mocking pattern in export-fonts.test.ts: stub the DOM globals
// dashboardThumb.ts touches directly, and mock its two collaborators so this
// test is purely about captureDashboardThumb's own bail-out/fallback logic
// (captureStable's own retry/validity behavior is covered in capture.test.ts).
vi.mock("../src/export/capture.js", () => ({
  captureJpegStable: vi.fn(),
}));
vi.mock("../src/export/exportReadiness.js", () => ({
  ensureExportImages: vi.fn(),
}));

import { captureDashboardThumb } from "../src/export/dashboardThumb.js";
import { captureJpegStable } from "../src/export/capture.js";
import { ensureExportImages } from "../src/export/exportReadiness.js";

interface FakeNode {
  isConnected: boolean;
  getBoundingClientRect: () => { width: number; height: number };
}

function fakeCanvasNode(overrides: Partial<FakeNode> = {}): FakeNode {
  return {
    isConnected: true,
    getBoundingClientRect: () => ({ width: 400, height: 300 }),
    ...overrides,
  };
}

describe("captureDashboardThumb", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns the freshly captured thumb on the happy path", async () => {
    const node = fakeCanvasNode();
    vi.stubGlobal("document", { querySelector: vi.fn(() => node) });
    vi.mocked(ensureExportImages).mockResolvedValue(undefined);
    vi.mocked(captureJpegStable).mockResolvedValue("data:image/jpeg;base64,fresh");

    const result = await captureDashboardThumb({ thumb: "data:image/jpeg;base64,old" } as any);

    expect(result).toBe("data:image/jpeg;base64,fresh");
  });

  it("returns previous.thumb (without capturing) when there is no .yz-canvas node", async () => {
    vi.stubGlobal("document", { querySelector: vi.fn(() => null) });

    const result = await captureDashboardThumb({ thumb: "data:image/jpeg;base64,old" } as any);

    expect(result).toBe("data:image/jpeg;base64,old");
    expect(ensureExportImages).not.toHaveBeenCalled();
    expect(captureJpegStable).not.toHaveBeenCalled();
  });

  it("preserves previous.thumb when the node is unmounted during the ensureExportImages await", async () => {
    const node = fakeCanvasNode();
    vi.stubGlobal("document", { querySelector: vi.fn(() => node) });
    vi.mocked(ensureExportImages).mockImplementation(async () => {
      // Simulate the user navigating back to the dashboard mid-await: the
      // `.yz-canvas` node gets unmounted before ensureExportImages resolves.
      node.isConnected = false;
    });

    const result = await captureDashboardThumb({ thumb: "data:image/jpeg;base64,old" } as any);

    expect(result).toBe("data:image/jpeg;base64,old");
    expect(captureJpegStable).not.toHaveBeenCalled();
  });

  it("preserves previous.thumb when the node collapses to a zero-size rect during the await", async () => {
    const node = fakeCanvasNode();
    vi.stubGlobal("document", { querySelector: vi.fn(() => node) });
    vi.mocked(ensureExportImages).mockImplementation(async () => {
      node.getBoundingClientRect = () => ({ width: 0, height: 0 });
    });

    const result = await captureDashboardThumb({ thumb: "data:image/jpeg;base64,old" } as any);

    expect(result).toBe("data:image/jpeg;base64,old");
    expect(captureJpegStable).not.toHaveBeenCalled();
  });

  it("preserves previous.thumb when captureJpegStable throws (e.g. no valid capture produced)", async () => {
    const node = fakeCanvasNode();
    vi.stubGlobal("document", { querySelector: vi.fn(() => node) });
    vi.mocked(ensureExportImages).mockResolvedValue(undefined);
    vi.mocked(captureJpegStable).mockRejectedValue(new Error("captureStable: no valid image capture was produced"));

    const result = await captureDashboardThumb({ thumb: "data:image/jpeg;base64,old" } as any);

    expect(result).toBe("data:image/jpeg;base64,old");
  });

  it("returns undefined when there is no previous document and no node", async () => {
    vi.stubGlobal("document", { querySelector: vi.fn(() => null) });

    const result = await captureDashboardThumb(null);

    expect(result).toBeUndefined();
  });
});
