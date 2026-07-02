import { describe, it, expect } from "vitest";
import {
  isAcceptedFile,
  downscaleDims,
  canvasMime,
  promisifyRequest,
  MAX_UPLOAD_DIM,
  ACCEPTED_EXT,
} from "../src/library/uploads.js";

describe("upload file-type validation", () => {
  it("accepts png/jpg/webp/svg by mime type", () => {
    for (const type of [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ]) {
      expect(isAcceptedFile({ type, name: "x" })).toBe(true);
    }
  });

  it("rejects non-image mime types", () => {
    expect(isAcceptedFile({ type: "application/pdf", name: "a.pdf" })).toBe(false);
    expect(isAcceptedFile({ type: "image/gif", name: "a.gif" })).toBe(false);
    expect(isAcceptedFile({ type: "text/plain", name: "a.png" })).toBe(false);
  });

  it("falls back to extension when the OS gives no mime type", () => {
    for (const ext of ACCEPTED_EXT) {
      expect(isAcceptedFile({ type: "", name: `photo.${ext}` })).toBe(true);
      expect(isAcceptedFile({ type: "", name: `PHOTO.${ext.toUpperCase()}` })).toBe(true);
    }
    expect(isAcceptedFile({ type: "", name: "notes.txt" })).toBe(false);
    expect(isAcceptedFile({ type: "", name: "noext" })).toBe(false);
  });
});

describe("downscale math", () => {
  it("leaves small images untouched", () => {
    expect(downscaleDims(800, 600)).toEqual({
      width: 800,
      height: 600,
      scale: 1,
      scaled: false,
    });
    // exactly at the cap → no scaling
    expect(downscaleDims(MAX_UPLOAD_DIM, 100).scaled).toBe(false);
  });

  it("caps the longest side while preserving aspect ratio", () => {
    const r = downscaleDims(4800, 2400);
    expect(r.scaled).toBe(true);
    expect(Math.max(r.width, r.height)).toBe(MAX_UPLOAD_DIM);
    expect(r.width / r.height).toBeCloseTo(2, 5);
  });

  it("caps a tall image on its height", () => {
    const r = downscaleDims(1200, 6000);
    expect(r.height).toBe(MAX_UPLOAD_DIM);
    expect(r.width).toBe(Math.round(1200 * (MAX_UPLOAD_DIM / 6000)));
  });

  it("handles zero dimensions without dividing by zero", () => {
    expect(downscaleDims(0, 0).scaled).toBe(false);
  });

  it("respects a custom cap", () => {
    const r = downscaleDims(2000, 1000, 1000);
    expect(r.width).toBe(1000);
    expect(r.height).toBe(500);
  });
});

describe("canvas export mime (alpha handling)", () => {
  it("keeps png/webp/svg on png to preserve alpha, jpeg stays jpeg", () => {
    expect(canvasMime("image/png")).toBe("image/png");
    expect(canvasMime("image/webp")).toBe("image/png");
    expect(canvasMime("image/svg+xml")).toBe("image/png");
    expect(canvasMime("image/jpeg")).toBe("image/jpeg");
  });
});

describe("IndexedDB request wrapper", () => {
  it("resolves with the request result on success", async () => {
    const req: any = { result: 42, onsuccess: null, onerror: null };
    const p = promisifyRequest<number>(req);
    req.onsuccess();
    await expect(p).resolves.toBe(42);
  });

  it("rejects with the request error on failure", async () => {
    const err = new Error("boom");
    const req: any = { result: undefined, error: err, onsuccess: null, onerror: null };
    const p = promisifyRequest(req);
    req.onerror();
    await expect(p).rejects.toBe(err);
  });
});
