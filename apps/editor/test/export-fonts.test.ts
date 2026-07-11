import { afterEach, describe, expect, it, vi } from "vitest";
import { runExport } from "../src/export/runExport.js";
import { saveDataUrl } from "../src/native.js";
import { toPng } from "html-to-image";

vi.mock("html-to-image", () => ({
  toPng: vi.fn(),
  toJpeg: vi.fn(),
}));

vi.mock("../src/native.js", () => ({
  saveDataUrl: vi.fn(),
  saveBytes: vi.fn(),
}));

describe("export font readiness", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads rendered text fonts and waits for document.fonts.ready before capture", async () => {
    let readyResolved = false;
    let resolveReady!: () => void;
    const ready = new Promise<FontFaceSet>((resolve) => {
      resolveReady = () => {
        readyResolved = true;
        resolve({} as FontFaceSet);
      };
    });
    const load = vi.fn().mockResolvedValue([]);
    const textElement = {};
    const textNode = { textContent: "Launch Cover", parentElement: textElement };
    const canvas = { querySelectorAll: vi.fn(() => []) };
    vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
    vi.stubGlobal("getComputedStyle", vi.fn(() => ({
      display: "block",
      visibility: "visible",
      fontFamily: '"Playfair Display", serif',
      fontSize: "32px",
      fontStyle: "italic",
      fontWeight: "700",
    })));
    vi.stubGlobal("document", {
      fonts: { load, ready },
      querySelector: vi.fn(() => canvas),
      createTreeWalker: vi.fn(() => {
        let visited = false;
        return {
          currentNode: null as typeof textNode | null,
          nextNode() {
            if (visited) return false;
            visited = true;
            this.currentNode = textNode;
            return true;
          },
        };
      }),
    });

    vi.mocked(toPng).mockImplementation(async () => {
      expect(readyResolved).toBe(true);
      return "data:image/png;base64,export";
    });
    vi.mocked(saveDataUrl).mockResolvedValue();

    const exportPromise = runExport({
      format: "png",
      scale: 1,
      transparent: false,
      designName: "Cover",
      canvasWidth: 600,
      canvasHeight: 400,
    });

    await vi.waitFor(() => {
      expect(load).toHaveBeenCalledWith(expect.stringContaining("Playfair Display"));
    });
    expect(toPng).not.toHaveBeenCalled();

    resolveReady();
    await expect(exportPromise).resolves.toBe("data:image/png;base64,export");
    // The shared stable-capture helper (capture.ts) calls toPng repeatedly
    // until two consecutive results match; this mock returns the same value
    // every time, so it stabilizes on the very first repeat (2 calls).
    expect(toPng).toHaveBeenCalledTimes(2);
  });
});
